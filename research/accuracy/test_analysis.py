import copy, csv, datetime as dt, json, tempfile, unittest
from pathlib import Path
import numpy as np
from analyse import number, instant, metrics, equal_day_weights, fit, predict, split_days, past_train, rolling_folds, bootstrap, load_csv

def rows(n=50):
    return [dict(id=str(i),day=(dt.date(2026,1,1)+dt.timedelta(days=i//2)).isoformat(),actual=1+(i%5)*.25,predicted=1.3+(i%5)*.25,direction=220+i%20,period=9+i%4,localWave=.2+i%5*.1,windSpeed=12,windDirection=45,sector='215–225°' if i%20<6 else '>225–235°') for i in range(n)]

class AccuracyTests(unittest.TestCase):
    def test_numeric_csv_escape_and_missing(self):
        self.assertEqual(number("'-0.97"),-.97);self.assertIsNone(number(''));self.assertIsNone(number('NaN'));self.assertEqual(number('0'),0)
    def test_adelaide_dst(self):
        self.assertEqual(instant('2026-10-21T18:00',True).utcoffset(),dt.timedelta(hours=10,minutes=30))
        self.assertEqual(instant('2026-07-21T18:00',True).utcoffset(),dt.timedelta(hours=9,minutes=30))
    def test_metrics_bias_convention(self):
        r=[{'day':'a','actual':1,'predicted':2},{'day':'b','actual':2,'predicted':1}]
        m=metrics(r);self.assertEqual(m['mae'],1);self.assertEqual(m['bias'],0);self.assertEqual(m['rmse'],1)
    def test_equal_day_weights(self):
        r=[{'day':'a'},{'day':'a'},{'day':'b'}];self.assertTrue(np.allclose(equal_day_weights(r),[.25,.25,.5]))
    def test_whole_days_and_no_future_training(self):
        r=rows();dev,test=split_days(r);self.assertFalse(set(dev)&set(test))
        for train,ev in rolling_folds(r):
            self.assertLess(max(x['day'] for x in train),min(x['day'] for x in ev))
            gap=(dt.date.fromisoformat(min(x['day'] for x in ev))-dt.date.fromisoformat(max(x['day'] for x in train))).days
            self.assertGreaterEqual(gap,3)
    def test_evaluation_targets_cannot_affect_fit_or_prediction(self):
        r=rows();dev,test=split_days(r);training=past_train([x for x in r if x['day'] in dev],test[0])
        state=fit(training,'D',10);ev=copy.deepcopy([x for x in r if x['day'] in test]);before=[predict(x,state) for x in ev]
        for x in ev:x['actual']=1000
        self.assertEqual(before,[predict(x,state) for x in ev]);self.assertFalse(set(state['trainingDays'])&set(test))
    def test_missing_features_fitted_only_on_training(self):
        r=rows();r[0]['localWave']=None;state=fit(r,'D');q={**r[1],'localWave':None};self.assertTrue(np.isfinite(predict(q,state)))
    def test_sparse_sector_not_fitted(self):
        r=rows(4);state=fit(r,'C');self.assertTrue(all(v==0 for v in state['sectors'].values()))
    def test_clipped_predictions_and_unchanged_baseline(self):
        r=rows();q={**r[0],'predicted':5.9};state=fit(r,'B');state['offset']=10
        self.assertEqual(predict(q,state),6);self.assertEqual(predict(q,{'model':'A'}),5.9)
    def test_cluster_bootstrap_deterministic(self):
        r=rows();r=[{**x,'B':x['predicted']-.1} for x in r]
        a=bootstrap(r,'B');self.assertEqual(a,bootstrap(r,'B'));self.assertEqual(a['clusters'],25);self.assertAlmostEqual(a['improvement'],.1)
    def test_bad_record_is_audited_not_silently_scored(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3]) as d:
            p=Path(d)/'test.csv'
            p.write_text('id,observed_at_utc,forecast_time,location,calculation_snapshot_json\n1,invalid,invalid,Seaford,notjson\n')
            r=load_csv(p);self.assertEqual(len(r),1);self.assertFalse(r[0]['eligible']);self.assertIn('invalid_snapshot_json',r[0]['fatal'])
if __name__=='__main__':unittest.main()
