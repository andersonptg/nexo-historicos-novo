#!/usr/bin/env python3
"""NEXO BRANCO VIP: isolated Termux motor; does not send games to Worker.
The historical patterns below are NOT predictions of random outcomes.
"""
from __future__ import annotations
import argparse,base64,datetime as dt,fcntl,json,os,sqlite3,sys,time,uuid,urllib.request,urllib.error,urllib.parse
from contextlib import closing
from pathlib import Path
from zoneinfo import ZoneInfo
HOME=Path.home();DATA=HOME/'nexo_v1_dados';APP=HOME/'.config/nexo_branco_vip';LEGACY=HOME/'.config/nexo_v1'
ORIGINAL=DATA/'historicos.sqlite3';DB=DATA/'nexo_branco_vip.sqlite3';LOCK=DATA/'nexo-branco.lock';LOG=DATA/'nexo-branco.log';SITEFILE=LEGACY/'site_url';TOKENFILE=LEGACY/'ingest_token';TZ=ZoneInfo('America/Sao_Paulo')

def stamp():return int(time.time())
def log(s):
 DATA.mkdir(parents=True,exist_ok=True)
 with LOG.open('a') as f:f.write(dt.datetime.now(TZ).strftime('[%d/%m %H:%M:%S] ')+str(s)[:350]+'\n')
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.chmod(0o600);tmp.replace(path)
def saved():
 try:return json.loads((APP/'state.json').read_text())
 except (FileNotFoundError,ValueError):return {}
def site():
 u=SITEFILE.read_text().strip().rstrip('/');p=urllib.parse.urlsplit(u)
 if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment:raise ValueError('site_url deve usar HTTPS sem credenciais')
 return u

def remote(path,payload=None,raw=None,headers=None):
 token=TOKENFILE.read_text().strip()
 if len(token)<32:raise RuntimeError('Token de ingest invalido')
 data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else raw
 h={'Authorization':'Bearer '+token,'User-Agent':'NEXO-Branco-Termux/1.0','Accept':'application/json'}
 if payload is not None:h['Content-Type']='application/json'
 if headers:h.update(headers)
 request=urllib.request.Request(site()+path,data=data,headers=h,method='POST' if data is not None else 'GET')
 with urllib.request.urlopen(request,timeout=18) as res:
  result=json.load(res)
 if result.get('ok') is not True:raise RuntimeError('Worker recusou operacao')
 return result

def tg(token,method,body=None):
 if not token:raise RuntimeError('Configure primeiro o bot no ADM')
 data=json.dumps(body or {},ensure_ascii=False).encode()
 req=urllib.request.Request('https://api.telegram.org/bot'+token+'/'+method,data=data,headers={'Content-Type':'application/json','User-Agent':'NEXO-Branco-Termux/1.0'})
 with urllib.request.urlopen(req,timeout=22) as res:r=json.load(res)
 if not r.get('ok'):raise RuntimeError('Telegram: '+str(r.get('description','Erro'))[:120])
 return r['result']

def connect():
 db=sqlite3.connect(DB,timeout=12);db.row_factory=sqlite3.Row;db.execute('PRAGMA journal_mode=WAL')
 db.executescript('''CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE IF NOT EXISTS windows (id TEXT PRIMARY KEY,strategy TEXT,target INTEGER,ref INTEGER,origin INTEGER,kind TEXT,
  attention INTEGER DEFAULT 0,entered INTEGER DEFAULT 0,entered_at INTEGER DEFAULT 0,settled TEXT DEFAULT '',created INTEGER);
 CREATE TABLE IF NOT EXISTS delivery(event TEXT,chat TEXT,state TEXT,updated INTEGER,PRIMARY KEY(event,chat));
 CREATE TABLE IF NOT EXISTS scores(day TEXT,strategy TEXT,entries INTEGER DEFAULT 0,green INTEGER DEFAULT 0,red INTEGER DEFAULT 0,PRIMARY KEY(day,strategy));
 CREATE TABLE IF NOT EXISTS attention_messages(window_id TEXT,chat TEXT,message_id INTEGER,PRIMARY KEY(window_id,chat));
  CREATE TABLE IF NOT EXISTS white_hits(window_id TEXT,seq INTEGER,minute_epoch INTEGER,observed_at INTEGER,PRIMARY KEY(window_id,seq));''')
 db.execute('CREATE TABLE IF NOT EXISTS protection_only_windows(window_id TEXT PRIMARY KEY)')
 return db

def meta(db,key,default='0'):
 x=db.execute('SELECT value FROM meta WHERE key=?',(key,)).fetchone();return x['value'] if x else default

def setmeta(db,key,value):db.execute('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,str(value)))

def source_rows(cursor):
 if not ORIGINAL.exists():return []
 with closing(sqlite3.connect('file:'+str(ORIGINAL)+'?mode=ro',uri=True,timeout=8)) as src:
  src.row_factory=sqlite3.Row
  return [dict(x) for x in src.execute('SELECT seq,first_seen,minute_epoch,number,color FROM rounds WHERE game_id=? AND seq>? ORDER BY seq LIMIT 120',('blitz-double',cursor))]

def minute(ts):return dt.datetime.fromtimestamp(int(ts),TZ).replace(second=0,microsecond=0)
def epoch(x):return int(x.timestamp())
def slot(ts):return minute(ts).strftime('%H:%M')
def targets(history):
 """Minute rules plus two debtor-stone rules, triggered only on newest confirmed round."""
 if len(history)<2:return []
 a,b=history[-2:];ans=[];anchor=minute(b['minute_epoch'])
 if a['number']==4:
  step=10-anchor.minute%10
  ans.append(('branco-r1',epoch(anchor+dt.timedelta(minutes=step)),anchor.minute))
 if b['number']==11:
  reference=anchor-dt.timedelta(minutes=1)
  delta=(4-reference.minute)%10
  if delta==0 or reference+dt.timedelta(minutes=delta)<=anchor:delta+=10
  ans.append(('branco-r2',epoch(reference+dt.timedelta(minutes=delta)),reference.minute))
 if len(history)>=3 and a['number']==0:
  before,white,after=history[-3:];base=minute(white['minute_epoch'])
  if all(0<=int(x['number'])<=14 for x in (before,after)):
   target=epoch(base+dt.timedelta(minutes=int(before['number'])+int(after['number'])))
   ans.append(('branco-r3',target,base.minute))
   if base.minute%10==0:ans.append(('branco-r4',target,base.minute))
 if a['number']==4 and int(b['number'])!=4:
  ans.append(('branco-r5',stamp(),int(b['number'])))
 if b['number']==11 and int(a['number'])!=11:
  ans.append(('branco-r6',stamp(),int(a['number'])))
 return ans


def interpolate(template,window,white=None):
 target=dt.datetime.fromtimestamp(int(window['target']),TZ)
 before=target-dt.timedelta(minutes=1);after=target+dt.timedelta(minutes=1)
 actual=dt.datetime.fromtimestamp(int(white['minute_epoch']),TZ) if white else None
 table={'hora':target.strftime('%H'),'minuto':target.strftime('%M'),'numero':f"{window['ref']:02d}",
 'janela':before.strftime('%H:%M')+' até '+after.strftime('%H:%M'),
 'estrategia':{'branco-r1':'Pedra 4','branco-r2':'Pedra 11','branco-r3':'Branco + vizinhos','branco-r4':'Branco minuto 0','branco-r5':'Devedora apos 4','branco-r6':'Devedora antes do 11'}.get(window['strategy'],'Branco'),
 'hora_branco':actual.strftime('%H:%M') if actual else '--:--'}
 import re
 return re.sub(r'\{(hora|minuto|numero|janela|estrategia|hora_branco)\}',lambda m:table[m.group(1)],template or '')


# NEXO_BRANCO_TEMPO_V9 — entrada antecipada e GREEN por pedra, sem sinais retroativos.
# NEXO_BRANCO_V10_PROTECAO
def entry_message(window, sent_at=None):
 """Envio antecipado; quando a principal passou, anuncia SOMENTE protecao."""
 target=minute(window['target']);protect=target+dt.timedelta(minutes=4)
 if window.get('protection_only'):
  return 'BLITZ DOUBLE BRANCO PRO\n        ▫️PROTEÇÃO '+protect.strftime('%H:%M')
 return 'BLITZ DOUBLE BRANCO PRO\n        ▫️'+target.strftime('%H:%M')+'▫️'+protect.strftime('%M')

def inside_white_window(confirmed_minute,target_epoch):
 """Accept target minute and one minute on either side, including hour rollover."""
 return int(target_epoch)-60 <= int(confirmed_minute) < int(target_epoch)+120

def recipients(cfg):
 result=[str(g['id']) for g in cfg.get('groups',[]) if g.get('selected') and g.get('admin')]
 owner=str(cfg.get('ownerId') or '')
 if owner and owner not in result:result.append(owner)
 return result

def erase_attention(db,cfg,w):
 """Best-effort Telegram deletion of previously issued attention messages."""
 token=cfg.get('botToken')
 rows=db.execute('SELECT chat,message_id FROM attention_messages WHERE window_id=?',(w['id'],)).fetchall()
 for row in rows:
  try:
   tg(token,'deleteMessage',{'chat_id':row['chat'],'message_id':int(row['message_id'])})
  except Exception as ex:
   log('Aviso antigo nao apagado: '+str(ex)[:85])
  with db:db.execute('DELETE FROM attention_messages WHERE window_id=? AND chat=?',(w['id'],row['chat']))

# NEXO_BIBLIOTECA_CENTRAL_V7: text OR media; GREEN timestamp from the actual white round.
def signal(db,cfg,w,event,white=None):
 """Um unico formato por evento; cada pedra branca tem chave exclusiva.
 Incerto nunca e reenviado automaticamente, para evitar duplicidade.
 """
 delivered=0
 bot=cfg.get('botToken');tm=cfg['config'].get('templates',{}).get(event,{})
 chats=recipients(cfg)
 mode=tm.get('type','text')
 if mode not in ('text','sticker','gif'):mode='text'
 if mode=='text':
  if event=='entry' and w['strategy'] in ('branco-r5','branco-r6'):
   houses=max(1,min(30,int(cfg['config'].get('houses4' if w['strategy']=='branco-r5' else 'houses11',4))))
   message='Pedra '+str(int(w['ref']))+' puxa o próximo branco em até '+str(houses)+' casas 🏡 ⚪'
  elif event=='entry':message=entry_message(w)
  elif event=='green':message=interpolate(tm.get('text') or 'GREEN ✅✅✅✅ {hora_branco}',w,white)
  else:message=interpolate(tm.get('text',''),w,white)
 else:message=''
 media=None
 if mode in ('sticker','gif'):
  media=next((x for x in cfg.get('media',[]) if x.get('id')==tm.get('assetId') and x.get('kind')==mode),None)
  if not media or not media.get('fileId'):
   log('AVISO: evento '+event+' configurado como '+mode+' mas sem midia validada para o Branco')
   return 0
 if event=='entry':erase_attention(db,cfg,w)
 unique=':seq:'+str(white['seq']) if white is not None and event=='green' else ''
 key=w['id']+':'+event+unique
 for chat in chats:
  if db.execute('SELECT 1 FROM delivery WHERE event=? AND chat=?',(key,chat)).fetchone():continue
  with db:db.execute('INSERT INTO delivery VALUES(?,?,?,?)',(key,chat,'pending',stamp()))
  try:
   if mode=='text':
    if not message:raise RuntimeError('Texto do evento vazio')
    result=tg(bot,'sendMessage',{'chat_id':chat,'text':message,'disable_web_page_preview':True})
    if event=='attention' and result.get('message_id'):
     with db:db.execute('INSERT OR REPLACE INTO attention_messages(window_id,chat,message_id) VALUES (?,?,?)',(w['id'],chat,int(result['message_id'])))
   else:
    field='sticker' if mode=='sticker' else 'animation'
    tg(bot,'sendSticker' if mode=='sticker' else 'sendAnimation',{'chat_id':chat,field:media['fileId']})
   with db:db.execute('UPDATE delivery SET state=?,updated=? WHERE event=? AND chat=?',('sent',stamp(),key,chat))
   delivered+=1
  except Exception as e:
   with db:db.execute('UPDATE delivery SET state=?,updated=? WHERE event=? AND chat=?',('uncertain',stamp(),key,chat))
   log('Entrega incerta '+event+' '+str(e)[:115])
 return delivered

def store_window(db,strategy,target,ref,seq,kind='main'):
 # If window start already passed, do not generate old entries from delayed collection.
 now=stamp()
 if target-now<65 or target-now>86400:return
 id=f'{strategy}:{target}:{kind}'
 with db:db.execute('INSERT OR IGNORE INTO windows(id,strategy,target,ref,origin,kind,created) VALUES(?,?,?,?,?,?,?)',(id,strategy,target,ref,seq,kind,stamp()))

def process_new(db,cfg):
 """Dispara entrada no fechamento do padrao, usando minuto ALVO calculado.
 Uma janela por vez: nunca enfileira sinal sobreposto nem retroativo.
 """
 current=int(meta(db,'seq','0'));items=source_rows(current)
 if not items:return
 if current==0:
  with db:setmeta(db,'seq',max(x['seq'] for x in items));setmeta(db,'history','[]')
  log('Baseline: rodadas antigas ignoradas');return
 if len(items)>4 or items[0]['seq']>current+3 or stamp()-int(items[-1]['first_seen'])>100:
  with db:setmeta(db,'seq',max(x['seq'] for x in items));setmeta(db,'history','[]')
  log('Descontinuidade: rodadas antigas ignoradas, sem sinais');return
 recent=json.loads(meta(db,'history','[]'))
 enabled={s['id'] for s in cfg['config'].get('strategies',[]) if s.get('enabled')}
 for r in items:
  recent.append(r);recent=recent[-8:]
  settle(db,cfg,now=stamp())
  busy=bool(db.execute("SELECT 1 FROM windows WHERE settled='' AND kind IN ('main','debt') LIMIT 1").fetchone())
  if cfg['config'].get('enabled') and not busy:
   candidates=targets(recent)
   candidates.sort(key=lambda x:(0 if x[0] in ('branco-r4','branco-r5') else 1,x[0]))
   for strategy,computed,ref in candidates:
    if strategy not in enabled:continue
    now=stamp()
    if now-int(r['first_seen'])>85:continue
    lane='debt' if strategy in ('branco-r5','branco-r6') else 'main'
    if lane=='debt' and strategy=='branco-r5' and int(r['number'])==0:continue
    # Ao chegar a pedra seguinte a do branco, usar o calculo do padrao.
    target=int(computed) if lane=='main' else now
    protection_only=False
    if lane=='main':
     if target-now>86400:continue
     if now<target-60:
      protection_only=False
     elif now<target+120:
      # Inicio da protecao = alvo +3 min. Exigir 60s de antecedencia.
      protection_only=True
     else:
      log('Padrao '+strategy+' descartado: principal e protecao sem antecedencia segura')
      continue
    wid=f'{strategy}:seq:{r["seq"]}:{lane}'
    with db:
     db.execute('INSERT OR IGNORE INTO windows(id,strategy,target,ref,origin,kind,created) VALUES(?,?,?,?,?,?,?)',
                (wid,strategy,target,int(ref),int(r['seq']),lane,now))
    if lane=='main' and protection_only:
     with db:db.execute('INSERT OR IGNORE INTO protection_only_windows(window_id) VALUES (?)',(wid,))
    wrow=db.execute('SELECT * FROM windows WHERE id=? AND settled=?',(wid,'')).fetchone()
    if wrow is None:continue
    w=dict(wrow)
    if lane=='main':w['protection_only']=protection_only
    sent=signal(db,cfg,w,'entry')
    # '2' e entrega incerta. Nao presumir que houve postagem.
    with db:
     db.execute('UPDATE windows SET entered=?,entered_at=? WHERE id=?',(1 if sent else 2,now,wid))
     if sent:
      day=dt.datetime.fromtimestamp(now,TZ).strftime('%Y-%m-%d')
      db.execute('INSERT INTO scores(day,strategy,entries) VALUES (?,?,1) ON CONFLICT(day,strategy) DO UPDATE SET entries=entries+1',(day,strategy))
    log('Padrao '+strategy+' confirmado na rodada '+str(r['seq'])+' | '+('SOMENTE PROTECAO ' if protection_only else 'PRINCIPAL E PROTECAO ')+slot(target)+' | '+('entrada enviada' if sent else 'entrega incerta')+' | janela exclusiva')
    break
  with db:
   setmeta(db,'seq',r['seq']);setmeta(db,'history',json.dumps(recent,separators=(',',':')))

def settle(db,cfg,now=None,sync_only=False):
 """Mantem a janela principal e a protecao ate o ultimo giro.
 Um GREEN por pedra branca confirmada (seq), sem duplicacoes.
 RED somente quando as duas janelas terminarem e NENHUM branco tiver ocorrido.
 """
 now=int(now if now is not None else stamp())
 if not cfg['config'].get('enabled'):return
 rows=[dict(x) for x in db.execute("SELECT * FROM windows WHERE settled='' AND kind IN ('main','debt') ORDER BY created,origin,id")]
 for w in rows:
  target=int(w['target']);kind=w['kind'];strategy=w['strategy'];result=None
  if int(w['entered'])==2:
   # Entrega incerta: nao contar GREEN/RED de sinal nao confirmado.
   if now-int(w['created'])>86400:
    with db:db.execute("UPDATE windows SET settled='unconfirmed-delivery' WHERE id=?",(w['id'],))
   continue
  if not w['entered']:continue
  if kind=='debt':
   field='houses4' if strategy=='branco-r5' else 'houses11'
   houses=max(1,min(30,int(cfg['config'].get(field,4))))
   with closing(sqlite3.connect('file:'+str(ORIGINAL)+'?mode=ro',uri=True,timeout=8)) as src:
    src.row_factory=sqlite3.Row
    readings=[dict(x) for x in src.execute('SELECT seq,number,first_seen,minute_epoch FROM rounds WHERE game_id=? AND seq>? ORDER BY seq LIMIT ?',('blitz-double',int(w['origin']),houses))]
   white=next((x for x in readings if int(x['number'])==0),None)
   if white:result='green'
   elif len(readings)>=houses:result='red'
   elif now-int(w['created'])>3600:result='incomplete'
   if result in ('green','red'):
    signal(db,cfg,w,result,white=white)
  else:
   protection_only=bool(db.execute('SELECT 1 FROM protection_only_windows WHERE window_id=?',(w['id'],)).fetchone())
   before=target-60;end=target+120
   protect_start=target+3*60;protect_end=target+6*60
   intervals=((protect_start,protect_end),) if protection_only else ((before,end),(protect_start,protect_end))
   readings=[];counts=[]
   with closing(sqlite3.connect('file:'+str(ORIGINAL)+'?mode=ro',uri=True,timeout=8)) as src:
    src.row_factory=sqlite3.Row
    for lo,hi in intervals:
     rr=[dict(x) for x in src.execute('SELECT seq,minute_epoch,number,first_seen FROM rounds WHERE game_id=? AND minute_epoch>=? AND minute_epoch<? ORDER BY seq LIMIT 500',('blitz-double',lo,hi))]
     counts.append(len(rr));readings.extend(rr)
   unique={int(x['seq']):x for x in readings}
   valid=[x for x in sorted(unique.values(),key=lambda x:x['seq']) if int(x['number'])==0 and int(x['first_seen'])>=int(w['entered_at']) and int(x['seq'])>int(w['origin'])]
   # Grave cada observacao ANTES do envio; reinicios nao repetem figurinhas.
   for white in valid:
    with db:
     inserted=db.execute('INSERT OR IGNORE INTO white_hits(window_id,seq,minute_epoch,observed_at) VALUES(?,?,?,?)',(w['id'],int(white['seq']),int(white['minute_epoch']),stamp())).rowcount
    if not inserted:continue
    delivered=signal(db,cfg,w,'green',white=white)
    day=dt.datetime.fromtimestamp(int(w['entered_at']),TZ).strftime('%Y-%m-%d')
    with db:db.execute('UPDATE scores SET green=green+1 WHERE day=? AND strategy=?',(day,strategy))
    log('GREEN branco seq '+str(white['seq'])+' | horario '+slot(white['minute_epoch'])+' | envios confirmados '+str(delivered))
   def latest_round_at_or_after(limit):
    with closing(sqlite3.connect('file:'+str(ORIGINAL)+'?mode=ro',uri=True,timeout=8)) as check:
     last=check.execute('SELECT MAX(minute_epoch) FROM rounds WHERE game_id=?',('blitz-double',)).fetchone()[0]
    return last is not None and int(last)>=int(limit)
   if now<protect_end:continue
   hits=db.execute('SELECT COUNT(*) FROM white_hits WHERE window_id=?',(w['id'],)).fetchone()[0]
   if hits:
    result='green'
   elif all(n>=1 for n in counts) and latest_round_at_or_after(protect_end):
    # RED quando ha rodadas em ambas as janelas e a fonte ja passou do ultimo minuto.
    signal(db,cfg,w,'red');result='red'
   elif now>=protect_end+180:result='incomplete'
   else:continue
  if result is None:continue
  erase_attention(db,cfg,w)
  with db:
   db.execute('UPDATE windows SET settled=? WHERE id=?',(result,w['id']))
   if result=='red':
    day=dt.datetime.fromtimestamp(int(w['entered_at']),TZ).strftime('%Y-%m-%d')
    db.execute('UPDATE scores SET red=red+1 WHERE day=? AND strategy=?',(day,strategy))
   if result=='green' and kind=='debt':
    day=dt.datetime.fromtimestamp(int(w['entered_at']),TZ).strftime('%Y-%m-%d')
    db.execute('UPDATE scores SET green=green+1 WHERE day=? AND strategy=?',(day,strategy))
  log('Sinal '+w['id']+' finalizado: '+result+' | proxima estrategia liberada')

def score_snapshot(db):
 day=dt.datetime.now(TZ).strftime('%Y-%m-%d')
 rows={r['strategy']:dict(r) for r in db.execute('SELECT * FROM scores WHERE day=?',(day,))}
 ids=('branco-r1','branco-r2','branco-r3','branco-r4','branco-r5','branco-r6')
 return {'day':day,'seq':int(meta(db,'seq')),'scores':[{'id':id,'entries':int(rows.get(id,{}).get('entries',0)),'green':int(rows.get(id,{}).get('green',0)),'red':int(rows.get(id,{}).get('red',0))} for id in ids]}


# NEXO_BRANCO_PUXAR_V6: status seguro da captura (nao expor tokens nem mensagens).
def capture_status(db, status, detail='', received=None):
 try:
  n=int(meta(db,'captured_total','0'))
  remote('/api/branco-vip/pull-report',{'status':status,'detail':str(detail)[:95],
         'captured':n,'at':stamp(),'offset':int(meta(db,'telegram_offset','0'))})
 except Exception as e:log('CAPTURA: falha em informar status: '+str(e)[:95])

def get_updates(db,cfg):
 """Captura privada autorizada; somente confirma update depois de persistir a midia.
 Nunca registra token nem bytes de midia nos logs.
 """
 token=cfg.get('botToken');owner=str(cfg.get('ownerId') or '').strip()
 if not token:return
 off=int(meta(db,'telegram_offset','0'))
 try:
  updates=tg(token,'getUpdates',{'offset':off,'timeout':1,'limit':30,'allowed_updates':['message','my_chat_member','channel_post']})
 except Exception as e:
  msg=str(e)
  if '409' in msg:log('Telegram 409: outro getUpdates ou webhook disputando o bot Branco')
  else:log('Consulta Telegram falhou: '+msg[:130])
  return
 for update in updates:
  nextoff=int(update['update_id'])+1
  try:
   msg=update.get('message') or update.get('channel_post') or {}
   chat=msg.get('chat') or (update.get('my_chat_member') or {}).get('chat') or {}
   chat_id=str(chat.get('id') or '');typ=chat.get('type')
   if typ in ('group','supergroup','channel') and chat_id:
    me=tg(token,'getMe')
    status=tg(token,'getChatMember',{'chat_id':chat_id,'user_id':me['id']})
    adm=status.get('status') in ('administrator','creator')
    remote('/api/branco-vip/groups',{'id':chat_id,'name':chat.get('title') or 'Grupo Telegram','admin':adm})
   if typ=='private':
    sender=str(msg.get('from',{}).get('id') or '')
    sticker=msg.get('sticker');animation=msg.get('animation');document=msg.get('document')
    item=sticker or animation or (document if document and document.get('mime_type') in ('image/gif','video/mp4') else None)
    if item:
     if not owner or sender!=owner or chat_id!=owner:
      log('STICKER: remetente nao autorizado; final do Telegram='+sender[-4:]+', proprietario configurado='+('sim' if owner else 'nao'))
      # Nunca permitir vinculacao automatica: requer identidade autorizada no ADM.
      try:tg(token,'sendMessage',{'chat_id':chat_id,'text':'⚠️ Figurinha não cadastrada. Esta conta não é o proprietário autorizado do NEXO Branco. Verifique a vinculação do ID no ADM.'})
      except Exception:pass
     else:
      kind='sticker' if sticker else 'gif'
      thumb=item.get('thumbnail') or item.get('thumb')
      candidates=[thumb,item] if thumb else [item]
      payload=None
      for src in candidates:
       if not src or not src.get('file_id'):continue
       info=tg(token,'getFile',{'file_id':src['file_id']})
       path=str(info.get('file_path') or '')
       if not path or int(info.get('file_size') or 0)>5*1024*1024:continue
       url='https://api.telegram.org/file/bot'+token+'/'+path
       with urllib.request.urlopen(url,timeout=16) as resp:raw=resp.read(5*1024*1024+1)
       if len(raw)>5*1024*1024 or len(raw)<30:continue
       ext=path.lower().rsplit('.',1)[-1]
       mime={'webp':'image/webp','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','gif':'image/gif','mp4':'video/mp4'}.get(ext,'')
       if raw.startswith(b'RIFF') and raw[8:12]==b'WEBP':mime='image/webp'
       elif raw.startswith(b'\xff\xd8\xff'):mime='image/jpeg'
       elif raw.startswith(b'\x89PNG\r\n\x1a\n'):mime='image/png'
       elif raw.startswith((b'GIF87a',b'GIF89a')):mime='image/gif'
       elif raw[4:8]==b'ftyp':mime='video/mp4'
       if mime not in ('image/webp','image/jpeg','image/png','image/gif','video/mp4'):continue
       payload=(raw,mime);break
      if payload is None:
       log('STICKER: sem previa em formato compatível (WebP/JPG/PNG/GIF/MP4)')
       try:tg(token,'sendMessage',{'chat_id':chat_id,'text':'⚠️ Não consegui obter uma prévia compatível. Tente uma figurinha estática ou GIF menor.'})
       except Exception:pass
      else:
       raw,mime=payload
       stable=str(item.get('file_unique_id') or item.get('file_id'))
       key='b'+uuid.uuid5(uuid.NAMESPACE_URL,'nexo-branco-vip/media/'+stable).hex
       remote('/api/branco-vip/media',{'media':{'id':key,'fileId':item['file_id'],'kind':kind,'mime':mime,'name':('STICKER' if kind=='sticker' else 'GIF')+' · '+dt.datetime.now(TZ).strftime('%d/%m %H:%M')},'data':base64.b64encode(raw).decode('ascii')})
       with db:setmeta(db,'captured_total',int(meta(db,'captured_total','0'))+1)
       log('STICKER: midia '+kind+' confirmada no R2 e disponivel no ADM')
       try:tg(token,'sendMessage',{'chat_id':chat_id,'text':'✅ Figurinha/GIF cadastrado no NEXO Branco. Atualize a biblioteca no ADM.'})
       except Exception:pass
  except Exception as e:
   # Nao consumir a mensagem em falha de upload: na proxima tentativa pode persistir.
   # O identificador estavel evita duplicar a mesma media no R2.
   log('STICKER: falha ao processar atualizacao; sera tentada novamente: '+str(e)[:130])
   break
  else:
   with db:setmeta(db,'telegram_offset',nextoff)

def run():
 DATA.mkdir(parents=True,exist_ok=True);APP.mkdir(parents=True,exist_ok=True);APP.chmod(0o700)
 with LOCK.open('a+') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:print('Robô Branco já está ativo');return
  with closing(connect()) as db:
   log('Robô Branco V1 iniciado; sem alterar motor de cores')
   config=saved() or None
   last_fetch=last_score=last_status=last_capture_status=0
   while True:
    try:
     if stamp()-last_fetch>=15:
      data=remote('/api/branco-vip/sync')
      if data.get('botToken'):
       old=saved()
       if old.get('botToken')!=data['botToken']:
        with db:setmeta(db,'telegram_offset',0)
        log('Bot Branco atualizado: reiniciado cursor de mensagens')
       state={**data,'media':old.get('media',[]),'fetchedAt':stamp()}
       # Separate media catalog is delivered in /api/adm/branco-vip; sync preview catalog via additional endpoint.
       if 'media' in data:state['media']=data['media']
       atomic(APP/'state.json',state);config=state
      last_fetch=stamp()
     if config:
      get_updates(db,config)
      if stamp()-last_capture_status>=15:
       capture_status(db,'consultando','Bot Branco consultado; confira log se houver falha Telegram')
       last_capture_status=stamp()
      if config['config'].get('enabled'):process_new(db,config);settle(db,config)
      else:
       # Paused: move baseline forward with no backfill.
       with db:db.execute("UPDATE windows SET settled='paused-v4' WHERE settled=''")
       items=source_rows(int(meta(db,'seq')))
       if items:
        with db:setmeta(db,'seq',max(x['seq'] for x in items));setmeta(db,'history','[]')
      if stamp()-last_score>=30:remote('/api/branco-vip/scores',score_snapshot(db));last_score=stamp()
      if stamp()-last_status>=30:remote('/api/branco-vip/status',{'seq':int(meta(db,'seq')),'running':bool(config['config']['enabled'])});last_status=stamp()
    except Exception as e:log('Falha de ciclo: '+str(e)[:170])
    time.sleep(2)

def teste_v2():
 def row(n,hh,mm,seq):return {'number':n,'minute_epoch':epoch(dt.datetime(2026,11,25,hh,mm,tzinfo=TZ)),'seq':seq}
 assert ('branco-r2',epoch(dt.datetime(2026,11,25,0,44,tzinfo=TZ)),34) in targets([row(3,0,34,1),row(11,0,35,2)])
 assert ('branco-r2',epoch(dt.datetime(2026,11,25,0,44,tzinfo=TZ)),35) in targets([row(3,0,35,1),row(11,0,36,2)])
 out=targets([row(8,22,27,1),row(0,22,28,2),row(3,22,29,3)])
 assert ('branco-r3',epoch(dt.datetime(2026,11,25,22,39,tzinfo=TZ)),28) in out
 out=targets([row(3,0,39,1),row(0,0,40,2),row(1,0,40,3)])
 assert ('branco-r4',epoch(dt.datetime(2026,11,25,0,44,tzinfo=TZ)),40) in out
 out=targets([row(4,16,29,1),row(7,16,30,2)])
 assert ('branco-r1',epoch(dt.datetime(2026,11,25,16,40,tzinfo=TZ)),30) in out
 print('OK V2: pedra 4, pedra 11, vizinhos, minuto 00/10/20/30/40/50')

def diagnosticar():
 print('=== ROBÔ BRANCO · DIAGNÓSTICO ===')
 print('Motor SQLite:', ORIGINAL.exists())
 print('Token de sincronizacao local:', TOKENFILE.exists())
 try:
  cfg=remote('/api/branco-vip/sync')
  token=cfg.get('botToken')
  print('Worker Branco:', 'respondeu')
  print('Token Branco:', 'cadastrado' if token else 'ausente')
  print('Grupos detectados:',len(cfg.get('groups',[])))
  print('Biblioteca de midias:',len(cfg.get('media',[])))
  print('Motor habilitado no ADM:',bool(cfg.get('config',{}).get('enabled')))
  if token:
   me=tg(token,'getMe');print('Bot Telegram:', '@'+str(me.get('username','sem_nome')))
   info=tg(token,'getWebhookInfo')
   print('Webhook no bot Branco:', 'ATIVO (impede getUpdates)' if info.get('url') else 'desligado')
   if info.get('url'):print('Para migrar este bot exclusivo ao Termux, execute: python nexo_branco_motor.py habilitar-polling')
 except Exception as e:print('Erro:',str(e)[:240])
 print('Processos (verifique também): pgrep -af nexo_branco_motor.py')
 print('Log: tail -n 25 ~/nexo_v1_dados/nexo-branco.log')

def habilitar_polling():
 cfg=remote('/api/branco-vip/sync');token=cfg.get('botToken')
 if not token:raise RuntimeError('Token Branco nao foi cadastrado no ADM')
 info=tg(token,'getWebhookInfo')
 if not info.get('url'):
  print('O bot Branco ja esta sem webhook; getUpdates esta liberado.');return
 # Explicit user action; never revoke existing bot-of-colors webhook.
 result=tg(token,'deleteWebhook',{'drop_pending_updates':False})
 print('Webhook do bot BRANCO desativado:',bool(result),'| Mensagens pendentes preservadas')

def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['rodar','conferir','teste','teste-v2','iniciar','parar','diagnosticar','habilitar-polling']);a=p.parse_args()
 if a.action=='teste-v2':teste_v2();return
 if a.action=='diagnosticar':diagnosticar();return
 if a.action=='habilitar-polling':habilitar_polling();return
 if a.action=='teste':
  base=dt.datetime(2026,11,25,14,55,tzinfo=TZ)
  rows=[{'number':3,'minute_epoch':epoch(base)},{'number':0,'minute_epoch':epoch(base)},{'number':3,'minute_epoch':epoch(base)}]
  assert targets(rows)[0][1]==epoch(base+dt.timedelta(minutes=6))
  assert targets([{'number':4,'minute_epoch':epoch(base)},{'number':8,'minute_epoch':epoch(base)}])[0][1]==epoch(dt.datetime(2026,11,25,15,0,tzinfo=TZ))
  assert targets([{'number':5,'minute_epoch':epoch(base)},{'number':11,'minute_epoch':epoch(base)}])[0][1]==epoch(base+dt.timedelta(minutes=9))
  print('OK: regras calculadas e transicao de horario conferida');return
 if a.action=='conferir':
  print('Fonte SQLite:',ORIGINAL.exists());print('Credenciais de sync:',SITEFILE.exists() and TOKENFILE.exists());print('Estado configurado:',(APP/'state.json').exists());return
 if a.action=='parar':
  print('Para parar com seguranca: use o controle DESLIGAR no site (pausa sinais) ou encerre o processo pelo Termux.');return
 if a.action=='iniciar':
  import subprocess
  import fcntl as _fcntl
  if not ORIGINAL.exists():raise SystemExit('Banco de historico local nao encontrado')
  with LOG.open('ab') as out:
   proc=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'rodar'],stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
  print('Motor Branco iniciado PID:',proc.pid);return
 run()
if __name__=='__main__':main()
