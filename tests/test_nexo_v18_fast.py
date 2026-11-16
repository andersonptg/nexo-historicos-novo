# NEXO V18 - testes locais, sem requisicoes externas.
import unittest
from unittest.mock import patch
import nexo

class DummyDB:
    def close(self): self.closed=True

class V18FastTest(unittest.TestCase):
    def test_coleta_nao_aguarda_sincronizacao(self):
        db=DummyDB()
        with patch.object(nexo,'connection',return_value=db), \
             patch.object(nexo,'get_games',return_value=[{'id':'brabet-double','enabled':True,'kind':'double'}]), \
             patch.object(nexo,'collect_one',return_value={'ok':True,'new':1}), \
             patch.object(nexo,'sync',side_effect=AssertionError('sync nao pode ocorrer durante a coleta')):
            out=nexo.collect_only()
        self.assertTrue(out['ok'])
        self.assertEqual(out['coleta'][0]['new'],1)
        self.assertTrue(db.closed)
        self.assertGreaterEqual(out['source_ms'],0)

    def test_sincronizacao_isolada(self):
        db=DummyDB()
        with patch.object(nexo,'connection',return_value=db), \
             patch.object(nexo,'sync',return_value={'ok':True,'resultados':[{'enviados':1}]}):
            out=nexo.sync_only()
        self.assertTrue(out['ok'])
        self.assertTrue(db.closed)
        self.assertIn('upload_ms',out)

if __name__=='__main__': unittest.main()
