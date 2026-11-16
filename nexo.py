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



# NEXO_V18_1_DURABLE_QUEUE - conferir por IDs, nunca por numero/minuto apenas.
def _v18_1_confirm_ids(base, game_id, entries):
    """So confirma um lote cujo ID e conteudo coincidam com o R2 publico."""
    from urllib.parse import quote
    try:
        u=base+'/api/history?game_id='+quote(str(game_id),safe='')+'&limit=200'
        request=Request(u,headers={'Accept':'application/json','Cache-Control':'no-store','User-Agent':'NEXO-V18.1-ack-check'})
        with urlopen(request,timeout=6) as response:
            if response.status!=200:return False
            data=json.load(response)
        if data.get('game_id')!=game_id:return False
        have={str(r.get('id')):r for r in data.get('items',[]) if isinstance(r,dict)}
        for row in entries:
            other=have.get(str(row['id']))
            if not other:return False
            for k in ('minute_epoch','number','color','seq'):
                if str(other.get(k))!=str(row.get(k)):return False
        return bool(entries)
    except Exception:
        return False

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
                # Prazo curto: o Worker V18.1 deve confirmar so apos gravar no R2
                # e colocar a entrega Telegram na fila duravel do Durable Object.
                with urlopen(req,timeout=9) as resp:
                    answer=json.load(resp)
                    if resp.status!=200 or answer.get('ok')!=True or answer.get('accepted')!=len(entries):
                        return {'ok':False,'error':'Resposta remota inesperada'}
                with db:
                    db.executemany('UPDATE rounds SET synced=1 WHERE id=?',[(x['id'],) for x in entries])
                sent+=len(entries)
            except HTTPError as e:
                # Um HTTP 5xx pode significar que o job nao foi enfileirado;
                # NAO marcar confirmado. Tentar depois sem apagar nenhum dado.
                return {'ok':False,'error':f'Site HTTP {e.code}; nenhum token foi mostrado'}
            except Exception as e:
                # ACK de rede perdido: se cada ID/numero/minuto/seq ja esta no
                # R2, nao retransmitir a mesma rodada. Checagem somente leitura.
                if _v18_1_confirm_ids(base,game['id'],entries):
                    with db:
                        db.executemany('UPDATE rounds SET synced=1 WHERE id=?',[(x['id'],) for x in entries])
                    sent+=len(entries)
                    print('[NEXO V18.1] Resposta nao chegou; IDs confirmados no R2 por leitura.',flush=True)
                else:
                    return {'ok':False,'error':f'Conexao: {type(e).__name__}; confirmacao R2 pendente'}
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



# NEXO V18: a coleta nao aguarda o Telegram/Cloudflare responder.
def collect_only():
    """Busca apenas a fonte publica e persiste as rodadas confirmadas no SQLite."""
    started=time.monotonic()
    db=connection()
    try:
        results=[]
        for game in get_games():
            if game.get('enabled') and game.get('kind')=='double':
                results.append(collect_one(db,game))
        return {'ok':all(x.get('ok') for x in results),
                'coleta':results,
                'source_ms':round((time.monotonic()-started)*1000)}
    finally:
        db.close()


def sync_only():
    """Um unico enviador independente consulta a fila SQLite nao sincronizada."""
    started=time.monotonic()
    db=connection()
    try:
        result=sync(db)
        result['upload_ms']=round((time.monotonic()-started)*1000)
        return result
    finally:
        db.close()


def fast_metrics(values):
    """Status local sem token. Atualizado por substituicao atomica."""
    try:
        DATA.mkdir(parents=True,exist_ok=True)
        destination=DATA/'velocidade.json'
        temporary=DATA/('velocidade.'+str(os.getpid())+'.tmp')
        temporary.write_text(json.dumps(values,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf8')
        os.replace(temporary,destination)
    except OSError:
        pass  # Falha de diagnostico nunca pode interromper o motor.

def run_motor(interval=1.0):
    """NEXO V18: duas tarefas, uma busca a fonte e outra sincroniza o R2.

    O navegador nao participa da coleta. A fonte so fornece minuto; nenhum
    segundo oficial e inventado. Falhas nao geram entradas ficticias.
    """
    import fcntl
    from concurrent.futures import ThreadPoolExecutor
    with open(DATA/'motor.lock','a+') as lock:
        try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Outro motor ja esta executando. Nao inicie um segundo.',flush=True)
            return
        signal.signal(signal.SIGTERM,lambda *_:sys.exit(0))
        MOTOR_PID.write_text(str(os.getpid())+'\n')
        import atexit
        def cleanup_pid():
            try:
                if MOTOR_PID.is_file() and MOTOR_PID.read_text().strip()==str(os.getpid()):
                    MOTOR_PID.unlink()
            except OSError:pass
        atexit.register(cleanup_pid)
        print('NEXO V18 | COLETA E ENVIO INDEPENDENTES',flush=True)
        print(f'Intervalo alvo de fonte: {interval:g}s; sem antecipar resultado publicado.',flush=True)
        print('Navegador pode fechar. Android pode suspender Termux; mantenha bateria irrestrita.',flush=True)
        metrics={'version':18,'source_ok':False,'r2_ok':False,
                 'aviso':'Tempos medidos pelo NEXO; a fonte publica so informa MINUTO, nao o segundo exato.'}
        failures=0
        next_sync=0.0
        last_status=0.0
        last_metrics=0.0
        last_source_error=''
        last_sync_error=''
        future=None
        with ThreadPoolExecutor(max_workers=1,thread_name_prefix='nexo-r2') as uploader:
            while True:
                started=time.monotonic()
                dirty_metrics=False
                # Recolhe somente um resultado por envio. Nunca dispara dois
                # POSTs simultaneos do mesmo motor (R2 e Telegram idempotentes).
                if future is not None and future.done():
                    try:
                        syn=future.result()
                        metrics['r2_ok']=bool(syn.get('ok'))
                        metrics['upload_ms']=syn.get('upload_ms')
                        metrics['ultima_resposta_r2']=int(time.time())
                        sent=sum(x.get('enviados',0) for x in syn.get('resultados',[])) if syn.get('ok') else 0
                        metrics['ultimo_lote_enviado']=sent
                        if sent:
                            print('['+time.strftime('%H:%M:%S')+'] R2 confirmado: '+str(sent)+' rodada(s)',flush=True)
                        if not syn.get('ok') and not syn.get('skipped'):
                            error=str(syn.get('error','Falha na sincronizacao'))
                            if error!=last_sync_error:print('['+time.strftime('%H:%M:%S')+'] SYNC: '+error,flush=True)
                            last_sync_error=error
                            next_sync=time.monotonic()+3.0
                        else:
                            last_sync_error=''
                            next_sync=time.monotonic()+3.0
                    except Exception as exc:
                        metrics['r2_ok']=False
                        error=type(exc).__name__+': '+str(exc)[:110]
                        if error!=last_sync_error:print('SYNC: '+error,flush=True)
                        last_sync_error=error
                        next_sync=time.monotonic()+3.0
                    future=None
                    dirty_metrics=True
                try:
                    out=collect_only()
                    ok=out['ok']
                    failures=0 if ok else min(8,failures+1)
                    new=sum(x.get('new',0) for x in out['coleta'])
                    metrics['source_ok']=ok
                    metrics['source_ms']=out['source_ms']
                    metrics['ultima_consulta_fonte']=int(time.time())
                    if ok:metrics['ultima_resposta_fonte_ok']=int(time.time())
                    if new:
                        metrics['ultima_pedra_observada_pelo_nexo']=int(time.time())
                        metrics['quantidade_novas_pedras']=new
                        print('['+time.strftime('%H:%M:%S')+'] +'+str(new)+' rodada(s) confirmada(s) na fonte.',flush=True)
                        dirty_metrics=True
                    source_error='; '.join(str(x.get('error','')) for x in out['coleta'] if not x.get('ok'))
                    if source_error and source_error!=last_source_error:
                        print('['+time.strftime('%H:%M:%S')+'] Fonte: '+source_error[:160],flush=True)
                        dirty_metrics=True
                    last_source_error=source_error
                    # O envio nunca atrasa a proxima consulta da fonte.
                    if future is None and (new or time.monotonic()>=next_sync):
                        future=uploader.submit(sync_only)
                        next_sync=time.monotonic()+5.0
                except KeyboardInterrupt:
                    print('Motor interrompido. Banco e fila de envio preservados.',flush=True)
                    break
                except Exception as exc:
                    failures=min(8,failures+1)
                    metrics['source_ok']=False
                    print('Falha de coleta:',type(exc).__name__,str(exc)[:130],flush=True)
                    dirty_metrics=True
                now_m=time.monotonic()
                if dirty_metrics or now_m-last_metrics>=30:
                    fast_metrics(metrics)
                    last_metrics=now_m
                if now_m-last_status>=30:
                    print('['+time.strftime('%H:%M:%S')+'] motor ativo | fonte: '+('OK' if metrics['source_ok'] else 'falha')+' | R2: '+('OK' if metrics['r2_ok'] else 'pendente/falha')+' | envio independente',flush=True)
                    last_status=now_m
                # Falhas repetidas nao martelam a fonte; HTTP 429 tem espera maior.
                if not failures:
                    delay=interval
                elif '429' in last_source_error:
                    delay=max(interval,min(30,3*(2**min(failures,4))))
                else:
                    delay=max(interval,min(8,2**max(0,failures-1)))
                time.sleep(max(0.1,delay-(time.monotonic()-started)))


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
        status_file=DATA/'velocidade.json'
        if status_file.is_file():
            try:
                dados=json.loads(status_file.read_text(encoding='utf8'))
                print('NEXO V18 | Diagnostico de velocidade (segundos medidos pelo NEXO):')
                for k in ('source_ok','r2_ok','source_ms','upload_ms','ultima_consulta_fonte',
                          'ultima_pedra_observada_pelo_nexo','ultima_resposta_r2','ultimo_lote_enviado'):
                    if k in dados:print(' ',k,':',dados[k])
            except (OSError,ValueError):pass
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
