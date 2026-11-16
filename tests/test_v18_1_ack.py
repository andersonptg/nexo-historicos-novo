"""V18.1: confira apenas IDs que ja chegaram ao R2."""
import json
import unittest
from unittest.mock import patch
import nexo

class FakeResponse:
    status=200
    def __init__(self, body):self.body=body.encode()
    def __enter__(self):return self
    def __exit__(self,*_):return None
    def read(self,n=-1):return self.body if n<0 else self.body[:n]

class AckRecoveryTests(unittest.TestCase):
    def test_confirm_all_ids_real_entries(self):
        row={'id':'ab'*16,'minute_epoch':1794815880,'number':14,'color':'black','seq':100}
        data={'game_id':'brabet-double','items':[row]}
        with patch.object(nexo,'urlopen',return_value=FakeResponse(json.dumps(data))):
            self.assertTrue(nexo._v18_1_confirm_ids('https://site.example','brabet-double',[row]))
    def test_never_confirm_by_number_and_minute_only(self):
        expected={'id':'ab'*16,'minute_epoch':1794815880,'number':14,'color':'black','seq':100}
        published=dict(expected,id='cd'*16)
        with patch.object(nexo,'urlopen',return_value=FakeResponse(json.dumps({'game_id':'brabet-double','items':[published]}))):
            self.assertFalse(nexo._v18_1_confirm_ids('https://site.example','brabet-double',[expected]))
    def test_wrong_sequence_or_color_cannot_confirm(self):
        row={'id':'ab'*16,'minute_epoch':1794815880,'number':14,'color':'black','seq':100}
        wrong=dict(row,seq=99)
        with patch.object(nexo,'urlopen',return_value=FakeResponse(json.dumps({'game_id':'brabet-double','items':[wrong]}))):
            self.assertFalse(nexo._v18_1_confirm_ids('https://site.example','brabet-double',[row]))
