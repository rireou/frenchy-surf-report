"""Offline, day-grouped analysis. Never contacts a provider or observation database."""
import argparse, collections, csv, datetime as dt, hashlib, json, math
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np

TZ = ZoneInfo('Australia/Adelaide')
SEED = 20261021
MODELS = ['A', 'B', 'C', 'D']
def number(x):
    if x is None or x == '': return None
    # The production CSV exporter escapes negative spreadsheet cells with '.
    if isinstance(x, str) and x.startswith("'-"): x = x[1:]
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError): return None
def instant(s, local=False):
    if not s: return None
    try:
        v = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
        return v.replace(tzinfo=TZ if local else dt.timezone.utc) if not v.tzinfo else v
    except ValueError: return None
def minutes(a, b): return (a-b).total_seconds()/60 if a and b else None
def sector(d):
    if d is None: return 'Missing'
    return '<215°' if d < 215 else '215–225°' if d <= 225 else '>225–235°' if d <= 235 else '>235–245°' if d <= 245 else '>245°'
def band(v, edges, labels):
    if v is None: return 'Missing'
    return labels[next((i for i, e in enumerate(edges) if v < e), len(edges))]
def equal_day_weights(rows):
    counts = collections.Counter(x['day'] for x in rows)
    w = np.array([1/counts[x['day']] for x in rows])
    return w/w.sum()
def metrics(rows, field='predicted', day_weighted=False):
    if not rows: return {'n':0, 'days':0, 'mae':None, 'bias':None, 'rmse':None}
    e = np.array([x[field]-x['actual'] for x in rows])
    w = equal_day_weights(rows) if day_weighted else np.ones(len(rows))/len(rows)
    return dict(n=len(rows), days=len(set(x['day'] for x in rows)), mae=float(w@abs(e)),
        bias=float(w@e), rmse=float(np.sqrt(w@(e**2))), within025=float(w@(abs(e)<=.2500001)),
        within05=float(w@(abs(e)<=.5000001)), over05=int(sum(e>.5000001)), under05=int(sum(e<-.5000001)),
        over1=int(sum(e>1.0000001)), under1=int(sum(e<-1.0000001)))
def load_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as source:
        raw = list(csv.DictReader(source))
    rows, seen = [], set()
    required = ['actual_ft','predicted_ft','swell_height_m','swell_direction_deg','swell_period_s','wind_speed_kmh','wind_direction_deg','tide_height_m']
    for i, r in enumerate(raw):
        flags, fatal = [], []
        try: s = json.loads(r.get('calculation_snapshot_json',''))
        except (ValueError, TypeError): s = {}; fatal.append('invalid_snapshot_json')
        obs = instant(r.get('observed_at_utc')); valid = instant(r.get('forecast_time'), True)
        if not obs or not valid: fatal.append('invalid_timestamp')
        if r.get('id') in seen: fatal.append('duplicate_id')
        seen.add(r.get('id'))
        if not r.get('id'): fatal.append('missing_id')
        if r.get('location') != 'Seaford': fatal.append('wrong_location')
        vals = {k:number(r.get(k)) for k in required}
        for k, v in vals.items():
            if v is None: fatal.append('missing_'+k)
        for k, (lo,hi) in {'actual_ft':(0,8),'predicted_ft':(0,8),'swell_height_m':(0,20),'swell_direction_deg':(0,360),'swell_period_s':(0,40),'wind_speed_kmh':(0,200),'wind_direction_deg':(0,360),'tide_height_m':(-2,5)}.items():
            if vals[k] is not None and not lo<=vals[k]<=hi: fatal.append('range_'+k)
        actual, predicted = vals['actual_ft'], vals['predicted_ft']
        if actual is not None and predicted is not None and abs(actual-predicted-(number(r.get('error_ft_actual_minus_predicted')) or 0))>.011: flags.append('exported_error_mismatch')
        for k,v in [('predictedFt',predicted),('modelPredictedFt',predicted)]:
            if number(s.get(k)) is None or v is None or abs(s[k]-v)>.011: flags.append('snapshot_'+k+'_mismatch')
        for col, key in [('swell_height_m','heightM'),('swell_direction_deg','directionDeg'),('swell_period_s','periodS')]:
            sv=number((s.get('activeDriver') or {}).get(key))
            if sv is None or vals[col] is None or abs(sv-vals[col])>.011: flags.append('snapshot_'+key+'_mismatch')
        if s.get('calculationVersion')!=r.get('calculation_version'): flags.append('snapshot_version_mismatch')
        if s.get('forecastTime')!=r.get('forecast_time'): flags.append('snapshot_valid_time_mismatch')
        for col, source, key in [('wind_speed_kmh','wind','wind_speed_10m'),('wind_direction_deg','wind','wind_direction_10m'),('tide_height_m','tide','heightM')]:
            sv=number((s.get(source) or {}).get(key))
            if sv is None or vals[col] is None or abs(sv-vals[col])>.011: flags.append('snapshot_'+col+'_mismatch')
        for source in ['offshore','local','wind']:
            time=(s.get(source) or {}).get('time')
            if time and time!=r.get('forecast_time'): flags.append(source+'_row_time_mismatch')
        tf=number((s.get('calculationTrace') or {}).get('finalFt'))
        if tf is not None and predicted is not None and abs(tf-predicted)>.011: flags.append('trace_final_prediction_mismatch')
        so=instant(s.get('observedAt'))
        if so and obs and abs(minutes(so,obs))>2: flags.append('snapshot_observation_time_mismatch')
        distance=abs(minutes(valid,obs)) if obs and valid else None
        if distance is not None and distance>90: flags.append('forecast_valid_time_over_90min')
        saved_distance=number(s.get('forecastDistanceMinutes'))
        if saved_distance is not None and distance is not None and abs(saved_distance-distance)>1.1: flags.append('saved_distance_mismatch')
        context=s.get('dataContext') or {}; provenance=s.get('provenance') or {}
        fetched=instant(provenance.get('fetchedAt') or context.get('generatedAt'))
        age=minutes(obs,fetched)
        if age is None: flags.append('unknown_source_time')
        elif age < -1: flags.append('source_generated_after_observation')
        elif age>60: flags.append('source_over_60min_old')
        if context.get('staleDataUsed') or provenance.get('staleDataUsed'): flags.append('marked_stale')
        created=instant(r.get('created_at_utc'))
        if not created: flags.append('unknown_created_time')
        elif minutes(created,obs)>60: flags.append('entry_over_1h_after_check')
        if not provenance.get('modelIssuedAt'): flags.append('provider_run_time_unknown')
        trace=s.get('calculationTrace') or {}
        if not trace: flags.append('no_rule_trace')
        if not r.get('condition'): flags.append('condition_unknown')
        if not s.get('measurementDefinition'): flags.append('size_definition_unknown')
        if not s.get('observerId'): flags.append('individual_observer_unknown')
        local=s.get('local') or {}; result=s.get('calculationResult') or {}
        row=dict(id=r.get('id'),line=i+2,day=obs.astimezone(TZ).date().isoformat() if obs else '',
            observedAt=r.get('observed_at_utc'),localTime=obs.astimezone(TZ).isoformat() if obs else '',
            forecastTime=r.get('forecast_time'),version=r.get('calculation_version'),actual=actual,predicted=predicted,
            direction=vals['swell_direction_deg'],period=vals['swell_period_s'],height=vals['swell_height_m'],
            windSpeed=vals['wind_speed_kmh'],windDirection=vals['wind_direction_deg'],windCompass=r.get('wind_direction_compass') or 'Missing',
            tideHeight=vals['tide_height_m'],tideStage=r.get('tide_stage') or 'Missing',tideRange=number(r.get('tide_range_m')),
            localWave=number(local.get('wave_height')),condition=r.get('condition'),note=r.get('note'),
            sourceAgeMinutes=age,validDistanceMinutes=distance,fetchLeadMinutes=minutes(valid,fetched),providerLeadMinutes=None,
            createdDelayMinutes=minutes(created,obs),sector=sector(vals['swell_direction_deg']),flags=flags,fatal=fatal,
            eligible=not fatal,snapshot=s,trace=trace,calculationResult=result)
        row['offshoreEnergyProxyM2S']=vals['swell_height_m']**2*vals['swell_period_s'] if vals['swell_height_m'] is not None and vals['swell_period_s'] is not None else None
        row['strictEligible']=row['eligible'] and age is not None and 0<=age<=60 and distance is not None and distance<=90 and not any(x.startswith('snapshot_') for x in flags) and 'marked_stale' not in flags
        rows.append(row)
    rows.sort(key=lambda x:x['observedAt'] or '')
    # Preserve related checks: report them, never silently discard them.
    for i,a in enumerate(rows):
        near=[b['id'] for j,b in enumerate(rows) if i!=j and a['day']==b['day'] and abs(minutes(instant(a['observedAt']),instant(b['observedAt'])))<=10]
        if near: a['flags'].append('check_within_10min'); a['nearChecks']=near
    return rows

def features(r):
    v=[r['predicted'],r['direction'],r['period'],r['localWave'],r['windSpeed']*math.cos(math.radians(r['windDirection']-270))]
    return [np.nan if x is None else x for x in v]
def fit(rows, model, alpha=10):
    w=equal_day_weights(rows); residual=np.array([x['actual']-x['predicted'] for x in rows])
    offset=float(np.clip(.5*(w@residual),-.5,.5))
    state=dict(model=model,offset=offset,trainingDays=sorted(set(x['day'] for x in rows)),trainingIds=[x['id'] for x in rows])
    if model=='C':
        state['sectors']={}
        for b in sorted(set(x['sector'] for x in rows)):
            sub=[x for x in rows if x['sector']==b]; nd=len(set(x['day'] for x in sub))
            state['sectors'][b]=float((equal_day_weights(sub)@np.array([x['actual']-x['predicted']-offset for x in sub]))*nd/(nd+8)) if nd>=5 else 0.
    if model=='D':
        X=np.array([features(x) for x in rows]); med=np.nanmedian(X,axis=0);med=np.nan_to_num(med)
        X=np.where(np.isnan(X),med,X); mean=w@X; scale=np.sqrt(w@((X-mean)**2));scale[scale<1e-9]=1
        X=np.column_stack([np.ones(len(rows)),(X-mean)/scale]); penalty=np.diag([0]+[alpha]*5)
        # Weight sum equals number of independent calendar days, not check count.
        weight=w*len(state['trainingDays']); beta=np.linalg.solve(X.T@(weight[:,None]*X)+penalty, X.T@(weight*residual))
        state.update(medians=med.tolist(),means=mean.tolist(),scales=scale.tolist(),beta=beta.tolist(),alpha=alpha)
    return state
def predict(row, state):
    model=state['model']; adjust=0
    if model=='B': adjust=state['offset']
    if model=='C': adjust=np.clip(state['offset']+state['sectors'].get(row['sector'],0),-.5,.5)
    if model=='D':
        v=np.array(features(row)); v=np.where(np.isnan(v),state['medians'],v)
        x=np.r_[1,(v-state['means'])/state['scales']]
        adjust=np.clip(x@state['beta'],-.75,.75)
    return float(np.clip(row['predicted']+adjust,0,6)) if model!='A' else row['predicted']
def split_days(rows):
    days=sorted(set(x['day'] for x in rows));n=max(1,math.ceil(.2*len(days)))
    return days[:-n],days[-n:]
def past_train(rows, start):
    boundary=dt.date.fromisoformat(start)-dt.timedelta(days=2)
    return [x for x in rows if dt.date.fromisoformat(x['day'])<boundary]
def rolling_folds(rows):
    days=sorted(set(x['day'] for x in rows));folds=[]
    for i in range(12,len(days),5):
        test=[x for x in rows if x['day'] in days[i:i+5]];train=past_train(rows,days[i])
        if len(set(x['day'] for x in train))>=8: folds.append((train,test))
    return folds
def bootstrap(rows, field, cluster='day', count=2000):
    if not rows: return None
    groups=collections.defaultdict(list)
    for x in rows: groups[x[cluster]].append(abs(x['predicted']-x['actual'])-abs(x[field]-x['actual']))
    means=np.array([np.mean(v) for v in groups.values()]);rng=np.random.default_rng(SEED)
    sampled=rng.choice(means,(count,len(means)),replace=True).mean(axis=1)
    return dict(improvement=float(means.mean()),lo=float(np.quantile(sampled,.025)),hi=float(np.quantile(sampled,.975)),clusters=len(means))
def compare(rows, field):
    e=np.array([x[field]-x['actual'] for x in rows]); b=np.array([x['predicted']-x['actual'] for x in rows])
    return dict(improved=int(sum(abs(e)<abs(b)-1e-9)),worsened=int(sum(abs(e)>abs(b)+1e-9)),unchanged=int(sum(abs(e-b)<=1e-9)),
        newOver05=[x['id'] for x,ee,bb in zip(rows,e,b) if ee>.500001 and bb<=.500001],
        newUnder05=[x['id'] for x,ee,bb in zip(rows,e,b) if ee<-.500001 and bb>=-.500001])
def grouped(rows, key):
    groups=collections.defaultdict(list)
    for x in rows: groups[key(x)].append(x)
    return [dict(label=k,**metrics(v),dayWeighted=metrics(v,day_weighted=True)) for k,v in sorted(groups.items())]
def rule_sensitivity(rows):
    groups=collections.defaultdict(list); conflicts=[]
    for r in rows:
        steps=r['trace'].get('steps',[])
        changed=[x for x in steps if number(x.get('deltaFt')) is not None and abs(x['deltaFt'])>.001]
        signs=[np.sign(x['deltaFt']) for x in changed]
        if any(a!=b for a,b in zip(signs,signs[1:])): conflicts.append(dict(id=r['id'],day=r['day'],changes=[dict(rule=x['rule'],delta=x['deltaFt']) for x in changed]))
        for step in changed:
            x={**r,'without':r['predicted']-step['deltaFt']};groups[step['rule']].append(x)
    return [dict(rule=k,n=len(v),days=len(set(x['day'] for x in v)),withRule=metrics(v),arithmeticWithout=metrics(v,'without'),helped=sum(abs(x['predicted']-x['actual'])<abs(x['without']-x['actual'])-1e-9 for x in v),harmed=sum(abs(x['predicted']-x['actual'])>abs(x['without']-x['actual'])+1e-9 for x in v)) for k,v in groups.items()],conflicts
def analyse(path):
    rows=load_csv(path);valid=[x for x in rows if x['eligible']]
    devdays,testdays=split_days(valid);dev=[x for x in valid if x['day'] in devdays];test=[x for x in valid if x['day'] in testdays]
    folds=rolling_folds(dev)
    penalties={}
    for alpha in [1,10,100]:
        scored=[]
        for train,ev in folds:
            state=fit(train,'D',alpha)
            scored.extend({**x,'D':predict(x,state)} for x in ev)
        penalties[alpha]=metrics(scored,'D',True)['mae']
    alpha=min(penalties,key=lambda k:penalties[k])
    development={};predictions=collections.defaultdict(dict);fold_details=[]
    for fi,(train,ev) in enumerate(folds):
        fold_details.append(dict(fold=fi+1,trainDays=len(set(x['day'] for x in train)),trainEnd=max(x['day'] for x in train),testStart=min(x['day'] for x in ev),testEnd=max(x['day'] for x in ev),testN=len(ev)))
        for model in MODELS:
            state=fit(train,model,alpha)
            for x in ev: predictions[x['id']][model]=predict(x,state)
    scored=[{**x,**predictions[x['id']]} for x in dev if x['id'] in predictions]
    for model in MODELS: development[model]=dict(checkWeighted=metrics(scored,model),dayWeighted=metrics(scored,model,True))
    # Model selection is made using development scores only, before evaluating last block.
    selected=min(MODELS,key=lambda m:development[m]['dayWeighted']['mae'])
    train=past_train(dev,testdays[0]);states={m:fit(train,m,alpha) for m in MODELS}
    for r in rows:
        r['partition']='evaluation' if r['day'] in testdays else 'development'
        r['evaluationPredictions']={m:predict(r,states[m]) for m in MODELS} if r in test else None
    for x in test: x.update(x['evaluationPredictions'])
    # Consecutive observed calendar days are only a rough dependence sensitivity.
    block=0;previous=None
    for day in sorted(set(x['day'] for x in rows)):
        if previous is None or (dt.date.fromisoformat(day)-dt.date.fromisoformat(previous)).days>1: block+=1
        for x in rows:
            if x['day']==day: x['block']=block
        previous=day
    evaluation={m:dict(checkWeighted=metrics(test,m),dayWeighted=metrics(test,m,True),paired=compare(test,m),ci=bootstrap(test,m),blockCi=bootstrap(test,m,'block'),strict=metrics([x for x in test if x['strictEligible']],m),byVersion=grouped_model(test,m)) for m in MODELS}
    timely_train=[x for x in train if x['strictEligible']]
    timing_sensitivity={}
    for m in MODELS:
        state=fit(timely_train,m,alpha)
        ev=[{**x,'timelyPrediction':predict(x,state)} for x in test if x['strictEligible']]
        timing_sensitivity[m]=dict(trainingN=len(timely_train),trainingDays=len(set(x['day'] for x in timely_train)),evaluation=metrics(ev,'timelyPrediction'))
    rules,conflicts=rule_sensitivity(valid)
    recent=[x for x in valid if 'phase1' in x['version']]
    strata=dict(direction=grouped(valid,lambda x:x['sector']),period=grouped(valid,lambda x:band(x['period'],[9,11,14],['<9s','9–<11s','11–<14s','≥14s'])),height=grouped(valid,lambda x:band(x['height'],[2,3,4],['<2m','2–<3m','3–<4m','≥4m'])),wind=grouped(valid,lambda x:x['windCompass']),windSpeed=grouped(valid,lambda x:band(x['windSpeed'],[12,20,30],['<12km/h','12–<20km/h','20–<30km/h','≥30km/h'])),tide=grouped(valid,lambda x:x['tideStage']),tideHeight=grouped(valid,lambda x:band(x['tideHeight'],[.75,1.25,1.75],['<0.75m','0.75–<1.25m','1.25–<1.75m','≥1.75m'])),tideRange=grouped(valid,lambda x:band(x['tideRange'],[.7,1.3],['<0.7m','0.7–<1.3m','≥1.3m'])),surfSize=grouped(valid,lambda x:band(x['actual'],[1,2,3],['<1ft','1–<2ft','2–<3ft','≥3ft'])),directionPeriod=grouped(valid,lambda x:x['sector']+' / '+band(x['period'],[11],['<11s','≥11s'])))
    recent_strata={key:grouped(recent,fn) for key,fn in [('direction',lambda x:x['sector']),('period',lambda x:band(x['period'],[9,11,14],['<9s','9–<11s','11–<14s','≥14s'])),('tide',lambda x:x['tideStage'])]}
    quality=dict(total=len(rows),eligible=len(valid),uniqueDays=len(set(x['day'] for x in valid)),consecutiveDayBlocks=len(set(x['block'] for x in rows)),start=min(x['day'] for x in rows),end=max(x['day'] for x in rows),versions=dict(collections.Counter(x['version'] for x in rows)),flags=dict(collections.Counter(f for x in rows for f in x['flags'])),fatal=dict(collections.Counter(f for x in rows for f in x['fatal'])),strictEligible=sum(x['strictEligible'] for x in rows),traceRecords=sum(bool(x['trace']) for x in rows),notesPresent=sum(bool(x['note']) for x in rows),sourceAgeSummary=summary_numbers([x['sourceAgeMinutes'] for x in rows]),validDistanceSummary=summary_numbers([x['validDistanceMinutes'] for x in rows]),fetchLeadSummary=summary_numbers([x['fetchLeadMinutes'] for x in rows]))
    # Every record has an audit entry; never rewrite the original CSV/snapshot.
    safe_rows=[{k:v for k,v in x.items() if k not in ['snapshot','trace','calculationResult']} for x in rows]
    return dict(schema=1,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),seed=SEED,baselineCommit='4c943ff0a2f0eca3e1531949b378d93089ce7087',quality=quality,baseline=metrics(valid),baselineDayWeighted=metrics(valid,day_weighted=True),recentBaseline=metrics(recent),strictBaseline=metrics([x for x in valid if x['strictEligible']]),byVersion=grouped(valid,lambda x:x['version']),strata=strata,recentStrata=recent_strata,development=development,evaluation=evaluation,timingSensitivity=timing_sensitivity,protocol=dict(developmentDays=devdays,evaluationDays=testdays,trainingDays=states['A']['trainingDays'],embargoHours=48,folds=fold_details,ridgePenaltyScores=penalties,ridgePenalty=alpha,selectedOnDevelopment=selected,holdoutPristine=False),fittedStates=states,rules=rules,conflicts=conflicts,rows=safe_rows)
def grouped_model(rows, model):
    return [dict(version=v,**metrics([x for x in rows if x['version']==v],model)) for v in sorted(set(x['version'] for x in rows))]
def summary_numbers(values):
    a=[x for x in values if x is not None]
    return dict(n=len(a),min=min(a),median=float(np.median(a)),max=max(a)) if a else {'n':0}
def main():
    p=argparse.ArgumentParser();p.add_argument('csv',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    repo=Path(__file__).resolve().parents[2]
    if args.output.resolve().is_relative_to(repo): raise SystemExit('Private results must be outside the repository/publish directory')
    args.output.mkdir(parents=True,exist_ok=True);result=analyse(args.csv)
    (args.output/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    with (args.output/'record-audit.csv').open('w',encoding='utf-8',newline='') as f:
        fields=['id','line','day','version','actual','predicted','sourceAgeMinutes','validDistanceMinutes','strictEligible','eligible','flags','fatal'];w=csv.DictWriter(f,fields);w.writeheader()
        for row in result['rows']: w.writerow({k:'; '.join(row[k]) if isinstance(row[k],list) else row[k] for k in fields})
    print(json.dumps({k:result[k] for k in ['quality','baseline','recentBaseline','development','evaluation','protocol']},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
