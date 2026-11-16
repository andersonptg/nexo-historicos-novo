#!/usr/bin/env python3
"""NEXO V2 - controle de coleta, sincronizacao opcional e preview local."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs

from engine import BASE, DATA, DBPATH, connection, collect_one, get_games, get_state, history, days_available, prune_after_remote_ack

CONF=Path.home()/'.config/nexo_v1'
LOG=DATA/'motor.log'
MOTOR_PID=DATA/'motor.pid'
SITE_PID=DATA/'site.pid'
TOKEN=CONF/'ingest_token'
SITE_URL=CONF/'site_url'
HB_LAST={}  # ultima confirmacao remota por jogo; somente em memoria do motor


def prepare():
    DATA.mkdir(parents=True,exist_ok=True)
    CONF.mkdir(parents=True,exist_ok=True)
    os.chmod(CONF,0o700)
    with connection() as db: pass
    if not TOKEN.exists():
        TOKEN.write_text(secrets.token_urlsafe(48)+'\n',encoding='utf8')
        os.chmod(TOKEN,0o600)
    print('NEXO V1 preparado:',DATA)
    print('Secret local exclusivo criado (valor oculto):',TOKEN)
    print('Site Cloudflare remoto:','configurado' if SITE_URL.is_file() else 'nao configurado (preview local funciona)')


def sync(db):
    if not SITE_URL.is_file() or not TOKEN.is_file():return {'ok':False,'skipped':'site_ou_token_nao_configurado'}
    base=SITE_URL.read_text().strip().rstrip('/')
    if not base.startswith('https://'):
        return {'ok':False,'error':'URL do site precisa usar HTTPS'}
    token=TOKEN.read_text().strip()
    if len(token)<32:return {'ok':False,'error':'Token curto'}
    report=[]
    for game in get_games():
        if not game['enabled']:continue
        sent=0
        for _ in range(4):
            pending_count=db.execute('SELECT COUNT(*) FROM rounds WHERE game_id=? AND synced=0',(game['id'],)).fetchone()[0]
            data=db.execute('SELECT id,minute_epoch,number,color,seq FROM rounds WHERE game_id=? AND synced=0 ORDER BY minute_epoch DESC,seq DESC LIMIT 80',(game['id'],)).fetchall()
            if not data:break
            entries=[dict(x) for x in data]
            is_catchup=pending_count>80 or max(x['minute_epoch'] for x in entries)<int(time.time())-180
            raw=json.dumps({'game_id':game['id'],'items':entries,'catchup':is_catchup},separators=(',',':')).encode()
            req=Request(base+'/api/ingest',data=raw,method='POST',headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'User-Agent':'NEXO-V1-Termux'})
            try:
                with urlopen(req,timeout=12) as resp:
                    answer=json.load(resp)
                    if resp.status!=200 or answer.get('ok')!=True or answer.get('accepted')!=len(entries):
                        return {'ok':False,'error':'Resposta remota inesperada'}
                with db:
                    db.executemany('UPDATE rounds SET synced=1 WHERE id=?',[(x['id'],) for x in entries])
                sent+=len(entries)
            except HTTPError as e:return {'ok':False,'error':f'Site HTTP {e.code}; nenhum token foi mostrado'}
            except Exception as e:return {'ok':False,'error':f'Conexao: {type(e).__name__}'}
        removed=prune_after_remote_ack(db,game['id'],400) if sent else 0
        # Sinal de vida com baixa frequencia, independente da chegada de rodadas.
        # Ajuda o painel a distinguir motor ativo de resultado novo.
        if not sent and time.monotonic()-HB_LAST.get(game['id'],0)>=30:
            heartbeat=json.dumps({'game_id':game['id']}).encode()
            hb_req=Request(base+'/api/heartbeat',data=heartbeat,method='POST',headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'User-Agent':'NEXO-V2-Termux'})
            try:
                with urlopen(hb_req,timeout=10) as resp:
                    answer=json.load(resp)
                    if resp.status==200 and answer.get('ok'):
                        HB_LAST[game['id']]=time.monotonic()
            except Exception: pass  # Falha de heartbeat nao apaga dados nem interrompe coleta.
        if sent:HB_LAST[game['id']]=time.monotonic()
        report.append({'game_id':game['id'],'enviados':sent,'limpos_confirmados':removed})
    return {'ok':True,'resultados':report}


def collect_once(quiet=False):
    with connection() as db:
        results=[]
        for game in get_games():
            if game.get('enabled') and game.get('kind')=='double':
                result=collect_one(db,game)
                results.append(result)
                if not quiet:print(json.dumps(result,ensure_ascii=False))
        syn=sync(db)
        if not quiet:print('Sincronizacao:',json.dumps(syn,ensure_ascii=False))
        return {'ok':all(x.get('ok') for x in results),'coleta':results,'sync':syn}


def run_motor(interval=1.0):
    """Aba 1: processo visivel, lock exclusivo, logs resumidos.
    O intervalo e uma tentativa entre consultas, nao garantia de entrega imediata.
    """
    import fcntl
    with open(DATA/'motor.lock','a+') as lock:
        try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Outro motor ja esta executando. Use a Aba 2 para interrompe-lo primeiro.',flush=True)
            return
        signal.signal(signal.SIGTERM,lambda *_:sys.exit(0))
        MOTOR_PID.write_text(str(os.getpid())+'\n')
        import atexit
        def cleanup_pid():
            try:
                if MOTOR_PID.is_file() and MOTOR_PID.read_text().strip()==str(os.getpid()):MOTOR_PID.unlink()
            except OSError:pass
        atexit.register(cleanup_pid)
        print('NEXO V2 | MOTOR DE COLETA | TERMINAL 1',flush=True)
        print(f'Intervalo alvo: {interval:g}s | Fonte publica pode atrasar | Ctrl+C para parar',flush=True)
        print('Site remoto:', 'configurado' if SITE_URL.is_file() else 'AINDA NAO PUBLICADO (apenas local)',flush=True)
        failures=0;last_heartbeat=0;last_sync_error=''
        while True:
            started=time.monotonic()
            try:
                out=collect_once(quiet=True)
                ok=out['ok'];syn=out['sync']
                failures=0 if ok else min(8,failures+1)
                stamp=time.strftime('%H:%M:%S')
                new=sum(x.get('new',0) for x in out['coleta'])
                if new:
                    print(f'[{stamp}] +{new} novas rodadas salvas no Termux',flush=True)
                for x in out['coleta']:
                    if not x.get('ok'):
                        print(f'[{stamp}] Fonte {x.get("game_id")}: {x.get("error")}',flush=True)
                uploaded=sum(x.get('enviados',0) for x in syn.get('resultados',[])) if syn.get('ok') else 0
                removed=sum(x.get('limpos_confirmados',0) for x in syn.get('resultados',[])) if syn.get('ok') else 0
                if uploaded:
                    print(f'[{stamp}] R2 confirmado: {uploaded} | limpeza segura local: {removed}',flush=True)
                if not syn.get('ok') and not syn.get('skipped'):
                    err=str(syn.get('error','Falha remota'))
                    if err!=last_sync_error:print(f'[{stamp}] SYNC: {err}',flush=True)
                    last_sync_error=err
                else:last_sync_error=''
                if time.monotonic()-last_heartbeat>=30:
                    print(f'[{stamp}] motor ativo | fonte: {"OK" if ok else "falha"} | envio: {"configurado" if SITE_URL.is_file() else "pendente"}',flush=True)
                    last_heartbeat=time.monotonic()
            except KeyboardInterrupt:
                print('Motor interrompido pelo usuario, registros preservados.',flush=True)
                break
            except Exception as e:
                failures=min(8,failures+1)
                print('Falha do motor:',type(e).__name__,str(e)[:130],flush=True)
            # Rate limit, queda da fonte e rede ruim: espera progressiva ate 60s.
            wait=max(interval,min(20,2**failures)) if failures else interval
            time.sleep(max(0.1,wait-(time.monotonic()-started)))


def exclusive_manual(command):
    """Executa operacoes manuais com o MESMO lock do motor da Aba 1."""
    import fcntl
    with open(DATA/'motor.lock','a+') as lock:
        try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Motor ativo na Aba 1. Nao execute coleta/sync paralelo; use status.')
        if command=='coletar':return collect_once()
        if command=='sync':
            with connection() as db:return sync(db)
        raise ValueError('Comando manual desconhecido')


def pid_alive(path):
    try:
        pid=int(path.read_text().strip());os.kill(pid,0);return pid
    except (OSError,ValueError,FileNotFoundError):return None


def start(name,action):
    prepare()
    pidfile=MOTOR_PID if name=='motor' else SITE_PID
    if pid_alive(pidfile):print(name,'ja iniciado PID',pid_alive(pidfile));return
    logfile=LOG if name=='motor' else DATA/'site.log'
    with open(logfile,'ab') as f:
        proc=subprocess.Popen([sys.executable,str(BASE/'nexo.py'),action],stdin=subprocess.DEVNULL,stdout=f,stderr=f,start_new_session=True,cwd=str(BASE))
    pidfile.write_text(str(proc.pid)+'\n')
    print(name,'iniciado PID',proc.pid,'log:',logfile)
    if name=='site':print('Abra no navegador do Android: http://127.0.0.1:8765')


def stop(name):
    p=MOTOR_PID if name=='motor' else SITE_PID
    pid=pid_alive(p)
    if not pid:print(name,'ja estava parado');return
    os.kill(pid,signal.SIGTERM)
    print('Parada solicitada para',name,'PID',pid)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(BASE/'worker/public'),**kwargs)
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
    def send_json(self,data,code=200):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        u=urlsplit(self.path)
        if u.path=='/api/health':return self.send_json({'ok':True,'version':'2.0.0','motor':'termux','preview':True})
        if u.path=='/api/catalog':return self.send_json({'games':get_games()})
        if u.path=='/api/status':
            with connection() as db:return self.send_json(get_state(db))
        if u.path=='/api/days':
            q=parse_qs(u.query);gid=q.get('game_id',['brabet-double'])[0]
            if not any(g['id']==gid for g in get_games()):return self.send_json({'error':'Jogo desconhecido'},404)
            with connection() as db:dates=days_available(db,gid)
            return self.send_json({'game_id':gid,'days':dates,'origin':'sqlite-local'})
        if u.path=='/api/history':
            q=parse_qs(u.query);id=q.get('game_id',['brabet-double'])[0]
            game=next((g for g in get_games() if g['id']==id),None)
            if not game:return self.send_json({'error':'Jogo desconhecido'},404)
            try:limit=max(1,min(500,int(q.get('limit',['200'])[0])))
            except ValueError:limit=200
            try:offset=max(0,min(100000,int(q.get('offset',['0'])[0])))
            except ValueError:offset=0
            day=q.get('day',[None])[0]
            if day and not __import__('re').fullmatch(r'\d{4}-\d{2}-\d{2}',day):
                return self.send_json({'error':'Data invalida'},400)
            try:
                with connection() as db:data=history(db,id,limit,day,offset)
            except ValueError:return self.send_json({'error':'Data invalida'},400)
            return self.send_json(data)
        if u.path.startswith('/api/'):return self.send_json({'error':'Rota inexistente'},404)
        return super().do_GET()
    def log_message(self,*args):pass


def serve():
    prepare()
    server=ThreadingHTTPServer(('127.0.0.1',8765),Handler)
    print('Preview NEXO V1 http://127.0.0.1:8765',flush=True)
    server.serve_forever()


def main():
    p=argparse.ArgumentParser(description='NEXO V2 historicos Brabet Double')
    p.add_argument('acao',choices=['preparar','coletar','motor','iniciar','parar','status','comandos','site','site-iniciar','site-parar','sync','executar','testar'])
    p.add_argument('--interval',type=float,default=1.0,help='Intervalo alvo em segundos (minimo 1; sujeito a latencia e limites da fonte)')
    args=p.parse_args();a=args.acao
    if not 1<=args.interval<=60:p.error('interval deve estar entre 1 e 60 segundos')
    if a=='preparar':prepare()
    elif a=='coletar':
        prepare()
        sys.exit(0 if exclusive_manual('coletar')['ok'] else 1)
    elif a=='iniciar':start('motor','executar')
    elif a=='parar':stop('motor')
    elif a=='site-iniciar':start('site','site')
    elif a=='site-parar':stop('site')
    elif a in ('motor','executar'):prepare();run_motor(args.interval)
    elif a=='site':serve()
    elif a=='sync':
        print(exclusive_manual('sync'))
    elif a=='status':
        with connection() as db:print(json.dumps(get_state(db),ensure_ascii=False,indent=2))
        print('Motor PID:',pid_alive(MOTOR_PID) or 'parado','Site PID:',pid_alive(SITE_PID) or 'parado')
        print('Arquivos em:',DATA)
    elif a=='comandos':
        print('Aba 1: python nexo.py motor --interval 1')
        print('Aba 2: python nexo.py status | testar | site-iniciar | parar')
        print('sync e coletar manuais apenas quando o motor estiver parado.')
        print('Ctrl+C na Aba 1 encerra o motor; a Aba 2 nao o interrompe.')
    elif a=='testar':
        import unittest
        suite=unittest.defaultTestLoader.discover(str(BASE/'tests'),pattern='test_*.py')
        sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)

if __name__=='__main__':main()
