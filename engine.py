#!/usr/bin/env python3
"""NEXO V2: coleta PUBLICA de resultados e persiste no SQLite local.
Nao acessa plataformas autenticadas, nao faz apostas, nao envia sinais.
"""
from __future__ import annotations
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import time
import uuid
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
DATA = Path.home() / 'nexo_v1_dados'
DBPATH = DATA / 'historicos.sqlite3'
CONFIG = json.loads((BASE/'catalog.json').read_text(encoding='utf-8'))
TZ = ZoneInfo('America/Sao_Paulo')
TIME_PATTERN = re.compile(r'^(?:[01]?\d|2[0-3]):[0-5]\d$')


def connection():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DBPATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS rounds(
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, minute_epoch INTEGER NOT NULL,
      number INTEGER NOT NULL, color TEXT NOT NULL, first_seen INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0, seq INTEGER
    );
    CREATE INDEX IF NOT EXISTS rounds_by_game ON rounds(game_id,minute_epoch DESC);
    CREATE INDEX IF NOT EXISTS rounds_unsynced ON rounds(game_id,synced);
    CREATE TABLE IF NOT EXISTS snapshots(game_id TEXT PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS collection_state(game_id TEXT PRIMARY KEY,
      last_attempt INTEGER, last_success INTEGER, latest_minute INTEGER,
      last_count INTEGER NOT NULL DEFAULT 0, last_new INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT 'Aguardando coleta');
    ''')
    # Migracao nao destrutiva: manter IDs e rodadas existentes da V1.
    cols={r['name'] for r in db.execute('PRAGMA table_info(rounds)')}
    if 'seq' not in cols:
        db.execute('ALTER TABLE rounds ADD COLUMN seq INTEGER')
    needs=db.execute('SELECT 1 FROM rounds WHERE seq IS NULL LIMIT 1').fetchone()
    if needs:
        # Resultados antigos sem ordem oficial recebem ordem aproximada.
        # A partir desta versao, os novos recebem seq na ordem vista na fonte.
        game_ids=[r['game_id'] for r in db.execute('SELECT DISTINCT game_id FROM rounds')]
        with db:
            for gid in game_ids:
                allrows=db.execute('SELECT id FROM rounds WHERE game_id=? ORDER BY minute_epoch,first_seen,rowid',(gid,)).fetchall()
                db.executemany('UPDATE rounds SET seq=? WHERE id=?',[(i+1,r['id']) for i,r in enumerate(allrows)])
    return db


def clean_tokens(src):
    src = re.sub(r'<!--[\s\S]*?-->', '', src)
    src = re.sub(r'<(script|style|noscript)\b[^>]*>[\s\S]*?</\1\s*>', '', src, flags=re.I)
    src = re.sub(r'<img\b[^>]*\balt\s*=\s*["\'](?:branco|white)["\'][^>]*>', '>BRANCO<', src, flags=re.I)
    return [html.unescape(m.group(1)).replace('\xa0', ' ').strip()
            for m in re.finditer(r'>([^<>]+)<', src) if m.group(1).strip()]


def parse_double(src, now=None):
    now = now or int(time.time())
    if len(src) < 200: raise ValueError('Pagina publica vazia')
    tokens = clean_tokens(src)
    start = next((i for i,t in enumerate(tokens)
                  if t.lower().strip() in ('sem destaque', 'no focus')), -1)
    if start < 0: raise ValueError('Marcador Sem Destaque nao encontrado; layout mudou?')
    pairs=[]
    for i in range(start+1,len(tokens)-1,2):
        v,clock=tokens[i],tokens[i+1]
        num=0 if v.lower() in ('branco','white') else int(v) if re.fullmatch(r'\d{1,2}',v) else -1
        if not (0<=num<=14) or not TIME_PATTERN.fullmatch(clock): break
        pairs.append((num,clock))
        if len(pairs)>=200: break
    if len(pairs)<8: raise ValueError(f'Apenas {len(pairs)} resultados validos')
    today=dt.datetime.fromtimestamp(now,TZ).date()
    last=float('inf'); out=[]
    for num,clock in pairs:
        h,m=map(int,clock.split(':'))
        stamp=int(dt.datetime.combine(today,dt.time(h,m),tzinfo=TZ).timestamp())
        if (last==float('inf') and stamp>now+180) or (last!=float('inf') and stamp>last):
            today-=dt.timedelta(days=1)
            stamp=int(dt.datetime.combine(today,dt.time(h,m),tzinfo=TZ).timestamp())
        last=stamp
        out.append({'minute_epoch':stamp,'number':num,'color':'white' if num==0 else 'red' if num<=7 else 'black'})
    if out[0]['minute_epoch']>now+180: raise ValueError('Horario da fonte no futuro')
    return out


def snapshot_match(previous, current):
    # LCS: preserva os IDs mesmo com 2+ rodadas dentro do mesmo minuto.
    a=[(int(x['minute_epoch']),int(x['number'])) for x in previous]
    b=[(int(x['minute_epoch']),int(x['number'])) for x in current]
    n,m=len(a),len(b)
    dp=[[0]*(m+1) for _ in range(n+1)]
    for i in range(n-1,-1,-1):
        for j in range(m-1,-1,-1):
            dp[i][j]=1+dp[i+1][j+1] if a[i]==b[j] else max(dp[i+1][j],dp[i][j+1])
    ids=[None]*m;i=j=0
    while i<n and j<m:
        if a[i]==b[j]: ids[j]=previous[i]['id'];i+=1;j+=1
        elif dp[i+1][j]>=dp[i][j+1]:i+=1
        else:j+=1
    from collections import Counter
    ca,cb=Counter(a),Counter(b)
    unique={k:previous[i]['id'] for i,k in enumerate(a) if ca[k]==1}
    for j,k in enumerate(b):
        if ids[j] is None and ca[k]==1 and cb[k]==1: ids[j]=unique[k]
    return ids


def fetch_public(url):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; NexoHistoricosV1/1.0; public monitoring)',
                             'Accept':'text/html','Cache-Control':'no-cache'})
    with urlopen(req,timeout=18) as resp:
        if resp.status!=200:raise RuntimeError(f'Fonte HTTP {resp.status}')
        b=resp.read(2_000_001)
        if len(b)>2_000_000:raise RuntimeError('Pagina publica muito grande')
        return b.decode('utf-8','replace')


def collect_one(db, game, source_html=None, now=None):
    now=now or int(time.time()); key=game['id']
    with db:
        db.execute('INSERT INTO collection_state(game_id,last_attempt,message) VALUES(?,?,?) '
                   'ON CONFLICT(game_id) DO UPDATE SET last_attempt=excluded.last_attempt,message=excluded.message',
                   (key,now,'Consultando fonte publica'))
    try:
        records=parse_double(source_html if source_html is not None else fetch_public(game['source_url']),now)
        cache=db.execute('SELECT content FROM snapshots WHERE game_id=?',(key,)).fetchone()
        previous=json.loads(cache['content']) if cache else []
        matches=snapshot_match(previous,records)
        # Se o antigo topo desapareceu, nao fingir continuidade. Nunca apagar dados.
        if previous and not any(matches):
            raise RuntimeError('Janela de coleta sem sobreposicao; preservar dados e revisar manualmente')
        latest=records[0]['minute_epoch'];new=[];mapped=[None]*len(records)
        cursor=int(db.execute('SELECT COALESCE(MAX(seq),0) FROM rounds WHERE game_id=?',(key,)).fetchone()[0])
        # A fonte vem do mais novo para o mais antigo. Novas linhas recebem seq
        # cronologica crescente, sem depender de UUID aleatorio nem dos segundos.
        last_seq={r['id']:r['seq'] for r in db.execute('SELECT id,seq FROM rounds WHERE game_id=?',(key,))}
        for index in reversed(range(len(records))):
            record,mid=records[index],matches[index]
            ident=mid or uuid.uuid4().hex
            if mid is not None:
                seq=last_seq.get(mid)
                if seq is None:
                    cursor+=1;seq=cursor
            else:
                cursor+=1;seq=cursor
            row={**record,'id':ident,'seq':seq}
            mapped[index]=row
            if mid is None:new.append(row)
        with db:
            db.executemany('INSERT OR IGNORE INTO rounds(id,game_id,minute_epoch,number,color,first_seen,seq) VALUES(?,?,?,?,?,?,?)',
                           [(x['id'],key,x['minute_epoch'],x['number'],x['color'],now,x['seq']) for x in new])
            db.execute('INSERT INTO snapshots(game_id,content) VALUES(?,?) ON CONFLICT(game_id) DO UPDATE SET content=excluded.content',
                       (key,json.dumps(mapped,separators=(',',':'))))
            db.execute('UPDATE collection_state SET last_success=?,latest_minute=?,last_count=?,last_new=?,message=? WHERE game_id=?',
                       (now,latest,len(mapped),len(new),f'OK · {len(new)} registros novos · horario da fonte em minutos',key))
        return {'ok':True,'game_id':key,'new':len(new),'count':len(mapped),'latest_minute':latest}
    except Exception as exc:
        with db:
            db.execute('UPDATE collection_state SET message=? WHERE game_id=?',(str(exc)[:240],key))
        return {'ok':False,'game_id':key,'error':str(exc)[:240]}


def get_games():
    return [{**g,'interval_seconds':1 if g['id']=='brabet-double' else g.get('interval_seconds',60)} for g in CONFIG['games']]


def get_state(db):
    output=[]
    for game in get_games():
        row=db.execute('SELECT * FROM collection_state WHERE game_id=?',(game['id'],)).fetchone()
        stats=db.execute('SELECT COUNT(*) AS total,SUM(CASE WHEN synced=0 THEN 1 ELSE 0 END) AS pending FROM rounds WHERE game_id=?',(game['id'],)).fetchone()
        output.append({**game,'state':dict(row) if row else {'message':'Aguardando coleta'},'total':stats['total'],'pending_sync':stats['pending'] or 0})
    return {'games':output,'motor':'termux','checked_at':int(time.time())}


def history(db, game_id, limit=200, day=None, offset=0):
    limit=max(1,min(500,int(limit)))
    offset=max(0,min(100000,int(offset)))
    if day:
        from_dt=dt.datetime.strptime(day,'%Y-%m-%d').replace(tzinfo=TZ)
        start=int(from_dt.timestamp())
        end=int((from_dt+dt.timedelta(days=1)).timestamp())
        total=int(db.execute('SELECT COUNT(*) FROM rounds WHERE game_id=? AND minute_epoch>=? AND minute_epoch<?',(game_id,start,end)).fetchone()[0])
        rows=db.execute('SELECT id,number,color,minute_epoch,seq FROM rounds WHERE game_id=? AND minute_epoch>=? AND minute_epoch<? ORDER BY minute_epoch DESC,seq DESC,first_seen DESC LIMIT ? OFFSET ?',
                        (game_id,start,end,limit,offset)).fetchall()
    else:
        total=int(db.execute('SELECT COUNT(*) FROM rounds WHERE game_id=?',(game_id,)).fetchone()[0])
        rows=db.execute('SELECT id,number,color,minute_epoch,seq FROM rounds WHERE game_id=? ORDER BY minute_epoch DESC,seq DESC,first_seen DESC LIMIT ? OFFSET ?',
                        (game_id,limit,offset)).fetchall()
    return {'game_id':game_id,'items':[dict(x) for x in rows],'total':total,'offset':offset,'has_more':offset+len(rows)<total}


def days_available(db, game_id, limit=180):
    """Datas civis de Brasilia. A copia duravel de todos os dias esta no R2."""
    stamps=db.execute('SELECT DISTINCT minute_epoch FROM rounds WHERE game_id=? ORDER BY minute_epoch DESC LIMIT 30000',(game_id,)).fetchall()
    days=[];seen=set()
    for x in stamps:
        day=dt.datetime.fromtimestamp(x['minute_epoch'],TZ).date().isoformat()
        if day not in seen:
            days.append(day);seen.add(day)
            if len(days)>=limit:break
    return days


def prune_after_remote_ack(db, game_id, keep=400):
    """Limpa somente o que ja recebeu confirmacao de gravacao no Worker/R2.
    Preserva uma janela local para preview e reconciliacao do snapshot.
    """
    with db:
        result=db.execute('''DELETE FROM rounds WHERE game_id=? AND synced=1 AND id NOT IN (
            SELECT id FROM rounds WHERE game_id=?
            ORDER BY minute_epoch DESC,seq DESC LIMIT ?
        )''',(game_id,game_id,keep))
    return result.rowcount
