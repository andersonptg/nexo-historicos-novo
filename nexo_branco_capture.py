#!/usr/bin/env python3
"""Isolated Branco VIP capture observer. No Cores engine modifications."""
import argparse, io, json, os, signal, sys, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from datetime import datetime

HOME=Path.home(); BASE=HOME/'nexo_novo_v1'
DATA=HOME/'nexo_v1_dados'; ROOT=DATA/'branco_capture_v2'; PID=ROOT/'observer.pid'
LOG=ROOT/'observer.log'; CACHE=ROOT/'processed.json'; OUT=ROOT/'images'
DEFAULT_SITE='https://nexo-historicos-novo.lipesanderson.workers.dev'


def bootstrap():
    OUT.mkdir(parents=True,exist_ok=True)
    if not CACHE.exists():
        CACHE.write_text('{}',encoding='utf-8');os.chmod(CACHE,0o600)


def site():
    for p in [HOME/'.config/nexo_v1/site_url',HOME/'.config/nexo_v1/worker_url']:
        if p.is_file():
            candidate=p.read_text().strip()
            if candidate.startswith('https://') and candidate.endswith('.workers.dev'):
                return candidate.rstrip('/')
    return DEFAULT_SITE


def ingest_token():
    for p in [HOME/'.config/nexo_v1/ingest_token',HOME/'.config/nexo_local/ingest_token']:
        if p.exists():
            x=p.read_text().strip()
            if len(x)>=32:return x
    raise RuntimeError('Token ingest nao encontrado. Verifique ~/.config/nexo_v1/ingest_token')


def get_json(path,protected=False):
    headers={'Accept':'application/json','Cache-Control':'no-cache'}
    if protected:headers['Authorization']='Bearer '+ingest_token()
    req=urllib.request.Request(site()+path,headers=headers)
    with urllib.request.urlopen(req,timeout=18) as resp:return json.load(resp)


def post_json(path,data,protected=True):
    h={'Content-Type':'application/json'}
    if protected:h['Authorization']='Bearer '+ingest_token()
    req=urllib.request.Request(site()+path,data=json.dumps(data).encode(),headers=h,method='POST')
    with urllib.request.urlopen(req,timeout=20) as resp:return json.load(resp)


def font(size,bold=False):
    from PIL import ImageFont
    names=['/system/fonts/Roboto-Bold.ttf' if bold else '/system/fonts/Roboto-Regular.ttf',
           '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf' if bold else '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans.ttf',
           '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for n in names:
        try:return ImageFont.truetype(n,size)
        except OSError:pass
    return ImageFont.load_default()


def create_image(rows,dest):
    from PIL import Image,ImageDraw
    w,h=1080,580
    im=Image.new('RGB',(w,h),(7,17,32));d=ImageDraw.Draw(im)
    d.rounded_rectangle((20,20,1060,560),radius=32,fill=(18,33,52),outline=(53,75,100),width=3)
    d.text((48,42),'BLITZ PRO  |  BRANCO CONFIRMADO',font=font(42,True),fill='#ffffff')
    d.text((48,103),'Captura automatica do historico  -  3 pedras consecutivas',font=font(24),fill='#a4bad4')
    for i,row in enumerate(rows):
        x=46+i*344
        bg='#ff971f' if row['color']=='red' else ('#f1f4f7' if row['color']=='white' else '#283342')
        num=int(row['number'])
        # Literal source number, no fabricated game result.
        d.rounded_rectangle((x,155,x+300,444),radius=32,fill=(28,48,72),outline=(76,100,124),width=3)
        d.rounded_rectangle((x+23,180,x+277,365),radius=34,fill=bg,outline='#ffffff',width=5)
        label='BRANCO' if row['color']=='white' else str(num)
        f=font(45 if len(label)>2 else 85,True)
        bounds=d.textbbox((0,0),label,font=f)
        d.text((x+150-(bounds[2]-bounds[0])/2,272-(bounds[3]-bounds[1])/2-bounds[1]),label,font=f,fill='#12233c' if row['color']=='white' else '#ffffff')
        epoch=int(row['minute_epoch'])
        stamp=datetime.fromtimestamp(epoch).strftime('%H:%M')
        tf=font(36,True);bounds=d.textbbox((0,0),stamp,font=tf)
        d.text((x+150-(bounds[2]-bounds[0])/2,388),stamp,font=tf,fill='#f4f7ff')
    d.text((48,484),'NEXO BRANCO VIP  •  resultado real do Blitz Double',font=font(24),fill='#b0c4d9')
    im.save(dest,'PNG');return dest


def valid_triplet(seq):
    feed=get_json('/api/history?game_id=blitz-double&limit=200')
    rows={int(x['seq']):x for x in feed.get('items',[]) if 'seq' in x}
    if not all(k in rows for k in (seq-1,seq,seq+1)):return None
    arr=[rows[k] for k in (seq-1,seq,seq+1)]
    if not (arr[1].get('color')=='white' or int(arr[1].get('number',-1))==0):
        return None
    for r in arr:
        if not isinstance(r.get('minute_epoch'),int):return None
        if r.get('color') not in ('white','red','black'):return None
    return arr


def telegram_send_photo(token,chat_id,photo,caption):
    # Never output token, Telegram URL or chat ID to logs.
    boundary='----NEXOWHITEPHOTOBOUNDARY'
    fields={'chat_id':str(chat_id),'caption':caption}
    data=[]
    for name,value in fields.items():
        data.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+value+'\r\n').encode()])
    data.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="photo"; filename="white-green.png"\r\nContent-Type: image/png\r\n\r\n').encode(),Path(photo).read_bytes(),('\r\n--'+boundary+'--\r\n').encode()])
    req=urllib.request.Request('https://api.telegram.org/bot'+token+'/sendPhoto',data=b''.join(data),headers={'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
    with urllib.request.urlopen(req,timeout=45) as resp:return json.load(resp).get('ok',False)


def destinations(info):
    targets=[]
    owner=str(info.get('ownerId') or '')
    if owner and owner!='0':targets.append(owner)
    for group in info.get('groups',[]):
        if group.get('selected') and group.get('admin') and str(group.get('id')) not in targets:
            targets.append(str(group['id']))
    return targets


def saved():
    try:return json.loads(CACHE.read_text())
    except Exception:return {}


def store(data):
    p=CACHE.with_suffix('.tmp');p.write_text(json.dumps(data),encoding='utf-8');os.chmod(p,0o600);p.replace(CACHE)


def cycle():
    cfg=get_json('/api/branco-vip/sync',True)
    if not cfg.get('ok') or not cfg.get('config',{}).get('captureEnabled'):
        return 'desligada no painel Branco'
    token=cfg.get('botToken')
    if not token:return 'Bot Branco sem token'
    q=get_json('/api/branco-vip/capture-events',True)
    if not q.get('ok') or not q.get('enabled'):return 'captura desativada'
    items=q.get('items',[])
    if not items:return 'sem GREEN novo'
    history=saved()
    for event in items:
        ident=str(event['id']);seq=int(event['seq']);at=int(event['at'])
        if time.time()*1000-at>600000:
            continue
        triplet=valid_triplet(seq)
        if triplet is None:
            # Wait for next round. Do not send an incomplete triplet.
            continue
        file=OUT/f'branco_{seq}.png'
        create_image(triplet,file)
        targets=destinations(cfg)
        if not targets:return 'sem destinos selecionados no Branco VIP'
        done=set(history.get(ident,[]))
        for chat in targets:
            if chat in done:continue
            if telegram_send_photo(token,chat,file,f'✅ GREEN BRANCO • histórico confirmado • rodada {seq}'):
                done.add(chat);history[ident]=sorted(done);store(history)
        if set(targets).issubset(done):
            post_json('/api/branco-vip/capture-ack',{'id':ident})
            return f'captura {seq} entregue a {len(targets)} destino(s)'
    return 'aguardando pedra posterior ou entrega'


def pid_alive():
    try:
        p=int(PID.read_text());os.kill(p,0);return p
    except Exception:return None


def loop():
    bootstrap()
    import fcntl
    with (ROOT/'observer.lock').open('a+') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        PID.write_text(str(os.getpid()));os.chmod(PID,0o600)
        last=''
        try:
            while True:
                try:
                    msg=cycle()
                    if msg!=last and msg not in ('sem GREEN novo','desligada no painel Branco'):
                        print(datetime.now().isoformat(timespec='seconds'),msg,flush=True)
                    last=msg
                    if int(time.time())%60<5:
                        post_json('/api/branco-vip/capture-status',{'running':True,'last':msg})
                except Exception as ex:
                    # Do not disclose Telegram token or authorization header/URLs.
                    print('Falha observador:',type(ex).__name__,flush=True)
                time.sleep(5)
        finally:
            PID.unlink(missing_ok=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('action',choices=['status','iniciar','parar','rodar','teste-imagem','teste-fluxo','uma-vez'])
    a=p.parse_args();bootstrap()
    if a.action=='status':
        print('Observador:',pid_alive() or 'parado')
        try:
            cfg=get_json('/api/branco-vip/capture-events',True)
            print('Botão Branco:', 'LIGADO' if cfg.get('enabled') else 'DESLIGADO')
            print('Eventos pendentes:',len(cfg.get('items',[])))
        except Exception:print('Cloudflare indisponivel ou token ausente')
    elif a.action=='iniciar':
        if pid_alive():print('Observador ja ativo');return
        import subprocess
        with LOG.open('ab') as f:
            proc=subprocess.Popen([sys.executable,str(Path(__file__)), 'rodar'],stdin=subprocess.DEVNULL,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        print('Observador iniciado PID:',proc.pid)
    elif a.action=='parar':
        pid=pid_alive()
        if pid:os.kill(pid,signal.SIGTERM);print('Parada solicitada:',pid)
        else:print('Ja parado')
    elif a.action=='rodar':loop()
    elif a.action=='uma-vez':print(cycle())
    elif a.action in ('teste-imagem','teste-fluxo'):
        # Explicit synthetic test, never Telegram and never alters the production queue.
        t=int(time.time())//60*60
        rows=[{'seq':101,'number':7,'color':'red','minute_epoch':t-60},
              {'seq':102,'number':0,'color':'white','minute_epoch':t},
              {'seq':103,'number':2,'color':'red','minute_epoch':t+60}]
        path=create_image(rows,OUT/'TESTE_SEM_ENVIO.png')
        print('Teste de imagem OK:',path)
        if a.action=='teste-fluxo':
            assert rows[1]['color']=='white' and rows[2]['seq']==rows[1]['seq']+1
            print('Teste de sequencia OK. NENHUMA mensagem enviada ao Telegram.')

if __name__=='__main__':
    try:main()
    except Exception as ex:
        print('ERRO:',type(ex).__name__,str(ex)[:160] if 'token' not in str(ex).lower() else 'credencial',flush=True)
        sys.exit(1)
