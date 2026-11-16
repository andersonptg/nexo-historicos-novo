"""Casos conservadores de virada do dia do coletor Brabet Double."""
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine

TZ=ZoneInfo('America/Sao_Paulo')

def when(day,hour,minute,second=15):
    return int(datetime(2026,11,day,hour,minute,second,tzinfo=TZ).timestamp())

def fixture(entries):
    return '<html><body>'+('<p>Dados historicos em consulta</p>'*12)+'<div>Sem Destaque</div>'+''.join(f'<span>{num}</span><time>{clock}</time>' for num,clock in entries)+'</body></html>'

class RolloverRecoveryTests(unittest.TestCase):
    def test_fonte_reinicia_apos_meia_noite_preserva_historico_e_nao_duplica(self):
        previous=[(i%14+1,f'23:{59-i//2:02d}') for i in range(12)]
        current=[((i+5)%14+1,c) for i,c in enumerate(['00:04','00:04','00:03','00:03','00:02','00:02','00:01','00:00'])]
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(engine,'DATA',Path(tmp)),patch.object(engine,'DBPATH',Path(tmp)/'db.sqlite'):
                with engine.connection() as db:
                    game=engine.get_games()[0]
                    first=engine.collect_one(db,game,fixture(previous),when(15,23,59,45))
                    self.assertTrue(first['ok'],first)
                    resumed=engine.collect_one(db,game,fixture(current),when(16,0,5,0))
                    self.assertTrue(resumed['ok'],resumed)
                    self.assertEqual(resumed['new'],len(current))
                    self.assertIn('janela do novo dia',db.execute('SELECT message FROM collection_state WHERE game_id=?',(game['id'],)).fetchone()[0])
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM rounds').fetchone()[0],len(previous)+len(current))
                    again=engine.collect_one(db,game,fixture(current),when(16,0,5,10))
                    self.assertTrue(again['ok'],again)
                    self.assertEqual(again['new'],0)
    def test_gap_mesmo_dia_nao_gera_resultados_ficticios(self):
        a=[(i%14+1,f'13:{59-i//2:02d}') for i in range(12)]
        b=[((i+1)%14+1,f'14:{59-i//2:02d}') for i in range(12)]
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(engine,'DATA',Path(tmp)),patch.object(engine,'DBPATH',Path(tmp)/'db.sqlite'):
                with engine.connection() as db:
                    game=engine.get_games()[0]
                    first=engine.collect_one(db,game,fixture(a),when(16,13,59,30))
                    self.assertTrue(first['ok'])
                    failed=engine.collect_one(db,game,fixture(b),when(16,14,59,45))
                    self.assertFalse(failed['ok'])
                    self.assertIn('sem sobreposicao',failed['error'])
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM rounds').fetchone()[0],len(a))
    def test_fonte_antiga_ou_parcial_nao_reseta_a_janela(self):
        prev=[{'minute_epoch':when(15,23,59), 'number':4}]
        fresh=[{'minute_epoch':when(16,0,4), 'number':1} for _ in range(8)]
        stale=[{'minute_epoch':when(16,0,1), 'number':1} for _ in range(8)]
        self.assertTrue(engine.safe_new_day_window(prev,fresh,when(16,0,5)))
        self.assertFalse(engine.safe_new_day_window(prev,stale,when(16,0,6)))
        self.assertFalse(engine.safe_new_day_window(prev,fresh[:6],when(16,0,5)))

if __name__=='__main__':unittest.main()
