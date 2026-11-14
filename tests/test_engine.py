import sys
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import engine
from datetime import datetime
from zoneinfo import ZoneInfo
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import parse_double,snapshot_match

def fixture(entries):
    return '<html><body>'+'<p>Dados historicos em consulta</p>'*12+'<div>Sem Destaque</div>'+''.join(f'<span>{number}</span><time>{hour}</time>' for number,hour in entries)+'</body></html>'

class EngineTests(unittest.TestCase):
    def test_parse_200_results(self):
        now=int(datetime(2026,11,14,13,30,tzinfo=ZoneInfo('America/Sao_Paulo')).timestamp())
        rows=[(i%15,f'13:{(29-i//2)%60:02d}') for i in range(40)]
        parsed=parse_double(fixture(rows),now)
        self.assertEqual(len(parsed),len(rows))
        self.assertEqual(parsed[0]['number'],0)
        self.assertEqual(parsed[0]['color'],'white')
        self.assertEqual(parsed[1]['color'],'red')
        self.assertEqual(parsed[8]['color'],'black')
        self.assertTrue(all(parsed[i]['minute_epoch']>=parsed[i+1]['minute_epoch'] for i in range(len(rows)-1)))
    def test_rollover_midnight(self):
        now=int(datetime(2026,11,14,0,5,tzinfo=ZoneInfo('America/Sao_Paulo')).timestamp())
        rows=[(i%15,clock) for i,clock in enumerate(['00:04','00:03','00:03','00:02','00:01','00:00','23:59','23:58'])]
        r=parse_double(fixture(rows),now)
        self.assertEqual(datetime.fromtimestamp(r[6]['minute_epoch'],ZoneInfo('America/Sao_Paulo')).date().isoformat(),'2026-11-13')
    def test_matches_duplicate_minute(self):
        old=[{'id':str(i),'minute_epoch':1000-i//2*60,'number':i%15} for i in range(20)]
        current=[{'minute_epoch':1060,'number':3}, *[{'minute_epoch':x['minute_epoch'],'number':x['number']} for x in old[:18]]]
        matched=snapshot_match(old,current)
        self.assertIsNone(matched[0]);self.assertEqual(matched[1],'0');self.assertEqual(matched[-1],'17')
    def test_sqlite_dedup_and_preserve_on_failed_layout(self):
        now=int(datetime(2026,11,14,13,30,tzinfo=ZoneInfo('America/Sao_Paulo')).timestamp())
        rows=[(i%15,f'13:{(29-i//2)%60:02d}') for i in range(40)]
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(engine,'DATA',Path(tmp)),patch.object(engine,'DBPATH',Path(tmp)/'db.sqlite'):
                with engine.connection() as db:
                    game=engine.get_games()[0]
                    first=engine.collect_one(db,game,fixture(rows),now)
                    self.assertTrue(first['ok']);self.assertEqual(first['new'],40)
                    second=engine.collect_one(db,game,fixture(rows),now+60)
                    self.assertTrue(second['ok']);self.assertEqual(second['new'],0)
                    failed=engine.collect_one(db,game,'<p>nada</p>'*50,now+120)
                    self.assertFalse(failed['ok'])
                    count=db.execute('SELECT COUNT(*) FROM rounds').fetchone()[0]
                    self.assertEqual(count,40)
    def test_unknown_layout_fails_closed(self):
        with self.assertRaises(ValueError):parse_double('<p>nada</p>'*50)

if __name__=='__main__':unittest.main()

class V2UpgradeTests(unittest.TestCase):
    def test_order_with_two_rounds_same_minute(self):
        now=int(datetime(2026,11,14,13,30,tzinfo=ZoneInfo('America/Sao_Paulo')).timestamp())
        rows=[((i*3)%15,f'13:{(29-i//2)%60:02d}') for i in range(40)]
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(engine,'DATA',Path(tmp)),patch.object(engine,'DBPATH',Path(tmp)/'db.sqlite'):
                with engine.connection() as db:
                    game=engine.get_games()[0]
                    result=engine.collect_one(db,game,fixture(rows),now)
                    self.assertTrue(result['ok'])
                    seen=engine.history(db,game['id'],50)['items']
                    self.assertEqual([r['number'] for r in seen],[n for n,_ in rows])
                    second=engine.collect_one(db,game,fixture([(14,'13:29')]+rows[:-1]),now+20)
                    self.assertTrue(second['ok'])
                    self.assertEqual(second['new'],1)
                    self.assertEqual(engine.history(db,game['id'],1)['items'][0]['number'],14)
    def test_cleanup_keeps_unsynced_and_400_latest(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(engine,'DATA',Path(tmp)),patch.object(engine,'DBPATH',Path(tmp)/'db.sqlite'):
                with engine.connection() as db:
                    gid=engine.get_games()[0]['id']
                    with db:
                        for n in range(450):
                            db.execute('INSERT INTO rounds(id,game_id,minute_epoch,number,color,first_seen,synced,seq) VALUES (?,?,?,?,?,?,?,?)',
                                       (str(n),gid,1794600000+n,1,'red',1794600000+n,1 if n!=1 else 0,n+1))
                    removed=engine.prune_after_remote_ack(db,gid,400)
                    self.assertEqual(removed,49)
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM rounds WHERE synced=0').fetchone()[0],1)
