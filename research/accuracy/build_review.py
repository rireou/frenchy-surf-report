"""Build a private, offline HTML dashboard and a complete Markdown report."""
import argparse, json
from pathlib import Path

def fmt(v): return 'unknown' if v is None else f'{v:.3f}'
def table(headers,rows):
    cell=lambda x:str(x).replace('|','/').replace('\n',' ')
    return '| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+'\n'.join('| '+' | '.join(cell(v) for v in row)+' |' for row in rows)+'\n'
def build(folder):
    if folder.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
        raise RuntimeError('Private review artifacts must stay outside the repository/publish directory')
    j=json.loads((folder/'analysis.json').read_text(encoding='utf-8'))
    source=Path(__file__).with_name('dashboard.html').read_text(encoding='utf-8')
    embedded=json.dumps(j,ensure_ascii=False).replace('<','\\u003c')
    marker="fetch('/analysis.json').then(r=>{if(!r.ok)throw Error('Analysis is unavailable');return r.json()})"
    if source.count(marker)!=1: raise RuntimeError('Dashboard data loading anchor changed')
    (folder/'dashboard.html').write_text(source.replace(marker,'Promise.resolve('+embedded+')'),encoding='utf-8')
    q=j['quality'];b=j['baseline'];r=j['recentBaseline'];p=j['protocol'];e=j['evaluation'];s=j['strictBaseline']
    text=f'''# Seaford forecast accuracy review

21 October 2026. Private local research; no production deployment or data writes.

## Decision

Keep the existing production model. D is the strongest candidate for a locked, prospective shadow test, but not a validated replacement. On the final 26 checks / 9 days it lowers MAE from 0.630 to 0.518 ft. Its day-weighted improvement interval includes zero. B and C worsen MAE. No current coefficients, tide rules, wind rules, Gulf rules or Middleton calculations were changed.

## Data provenance and current accuracy

The supplied export is read-only, SHA-256 `{j['sourceSha256']}`. All 100 rows were parsed and audited. Saved forecasts and calculation snapshots are used; no historical weather was fetched or regenerated.

{q['total']} checks, {q['uniqueDays']} Adelaide calendar days, {q['consecutiveDayBlocks']} runs of consecutive observed days, {q['start']} to {q['end']}. Neither days nor these runs are guaranteed independent swell events. There is a large late-August/September gap. This is not seasonal validation.

{table(['Population','Checks / days','MAE ft','RMSE ft','Bias forecast − actual ft','Within ±0.5 ft'],[['All stored versions',f"{b['n']} / {b['days']}",fmt(b['mae']),fmt(b['rmse']),fmt(b['bias']),f"{b['within05']:.0%}"],['Current phase1 label',f"{r['n']} / {r['days']}",fmt(r['mae']),fmt(r['rmse']),fmt(r['bias']),f"{r['within05']:.1%}"],['Strict source-time screen',f"{s['n']} / {s['days']}",fmt(s['mae']),fmt(s['rmse']),fmt(s['bias']),f"{s['within05']:.1%}"]])}
The all-version score is historical service accuracy, not the accuracy of today's production engine replayed over all 100 observations. The newer subset contains different conditions and cannot establish that the newer version worsened accuracy. Version labels are not exact immutable source hashes. The earlier 67 checks lack the phase1 rule trace; exact current-model replay cannot be established without six-hour source history. Human scalar surf size was not defined as typical surf, wave-face height or occasional sets. Do not equate it to offshore significant wave height.

The overall mean absolute error is {b['mae']:.3f} ft, signed mean prediction error {b['bias']:+.3f} ft. {b['over05']} overcalls and {b['under05']} undercalls exceed 0.5 ft; {b['over1']+b['under1']} errors exceed 1 ft. Small average bias hides substantial errors in both directions.

## Record validation

- No invalid numeric targets, missing core swell/wind/tide inputs, duplicate IDs, corrupt snapshots, exported residual mismatches or snapshot/core field mismatches were found.
- Forecast valid rows are at most {q['validDistanceSummary']['max']:.0f} minutes from the observation after Adelaide daylight-saving conversion. That validates row matching, not forecast availability.
- {q['flags']['source_generated_after_observation']} records have source retrieval more than one minute after the observed time. Latest delay is approximately {-q['sourceAgeSummary']['min']/60:.1f} hours. {q['flags']['entry_over_1h_after_check']} were entered more than an hour later. These are retrospective comparisons, potentially using revised data; do not score them as proven advance forecasts.
- {q['strictEligible']} records have retrieval at or before the check, no more than 60 minutes old, and pass core consistency screens. No record is explicitly marked stale and no source age exceeds 60 minutes in the positive direction. Absence of a stale flag does not cure post-observation retrieval.
- Provider model-run issue time is unknown in all 100. Source generatedAt is retrieval time, not model issuance. True lead time is unavailable for every historical record.
- One creation timestamp is absent; ten condition labels are absent; all notes, individual observer identities, confidence and measurement definitions are absent. Do not invent these fields retroactively.
- Two checks on 21 October are within ten minutes (about two minutes apart, actuals differ). They remain stored and grouped on the same day, not treated as independent events. Every record and every flag is listed in record-audit.csv.
- These records include successes as well as errors, but numerical agreement does not establish an explicit human confirmation status. No selection/verification process establishes an unbiased random sample of all surf conditions.

## What succeeds and fails

### Direction and Gulf filtering

{table(['Direction','Checks / days','MAE ft','Bias forecast − actual ft'],[[x['label'],f"{x['n']} / {x['days']}",fmt(x['mae']),fmt(x['bias'])] for x in j['strata']['direction']])}
The clearest exploratory contrasts are overcalls in >225–235° and undercalls west of 245°. The west group has only nine checks / six days: it justifies targeted collection, not a new universal uplift. The well-balanced 215–225° aggregate does not validate the discontinuities within that band. Stratified current-version and equal-day scores are in analysis.json and dashboard filters; mixed versions and wind conditions confound causal interpretation.

The engine uses an empirical directional transfer, local marine-model cells, wind-wave/fetch memory, tide gates and caps. It is not a bathymetric ray-tracing or spectral Gulf propagation model. The four Gulf cells share Open-Meteo modelling: agreement is correlated model evidence, not four independent buoy measurements. No frozen QC-qualified buoy observations in this export establish what live buoys supported a historical correction. H²×T is included only as a diagnostic proxy in the audit data, never a wave-size multiplier or candidate feature.

### Period

{table(['Period','Checks / days','MAE ft','Bias ft'],[[x['label'],f"{x['n']} / {x['days']}",fmt(x['mae']),fmt(x['bias'])] for x in j['strata']['period']])}
11–14s overprediction exists in this sample, but that period range has **zero additive period bonus** below/equal 13s. Therefore it is incorrect to blame every such overcall on a long-period uplift. Directional transfer, selected driver, offshore amplitude and local confirmation matter jointly. Only two records are ≥14s, so the +0.5/+1ft long-period branches are poorly validated. Period influences driver ranking and the additive transfer; no extra H²×T adjustment was layered onto it.

### Tide and wind

{table(['Tide stage','Checks / days','MAE ft','Bias ft'],[[x['label'],f"{x['n']} / {x['days']}",fmt(x['mae']),fmt(x['bias'])] for x in j['strata']['tide']])}
Tide-stage association alone does not establish that a tide penalty is helpful. On eight actively tide-adjusted traced checks / seven days, an arithmetic removal changes MAE from 0.504 to 0.539 ft (five helped, three harmed). That weak, non-causal sensitivity is no basis to delete tide adjustments.

N/NE/E compression is a priority for investigation: six active traced checks on only two days; arithmetic removal changes MAE from 0.472 to 0.255 ft, with four harmed/two helped by the existing adjustment. Two days are insufficient to replace the rule. The west Gulf limiter is active on five traced checks / three days; arithmetic removal improves MAE only from 0.808 to 0.763 ft. Existing partial observation calibration improves its affected 15 checks / six days from 0.640 to 0.560 ft. Preserve this useful work.

Four traced checks contain direction reversals between rule deltas. These are interactions, not proof of contradictory bugs. Strong-230 floors run after wind compression and can intentionally restore size; observation calibration then runs after floors, and south-edge/nowcast floors can raise it again. Do not sum ablation gains or assume a removed cap would leave downstream branches unchanged. Rule sensitivities and their counts are in the dashboard.

## Validation and candidates

Protocol was fixed before candidate scoring in research/accuracy/PROTOCOL.md. Earlier observations train later predictions, whole Adelaide days stay together, with a conservative two-calendar-day embargo. Four expanding development folds cover 49 validation checks / 20 days. The final block is {p['evaluationDays'][0]} to {p['evaluationDays'][-1]}, 26 checks / 9 days, all bearing the phase1 label. No final-block outcomes choose hyperparameters. D penalty {p['ridgePenalty']} was selected using development only. This retrospective holdout is not demonstrably pristine: previous calibration and this chat's prior direction research have already examined part of the dataset.

A = unchanged stored forecast. B = shrunken scalar residual offset. C = B plus direction-sector residuals, with five-day minimum and shrinkage. D = regularised residual regression using stored prediction, direction, period, local wave and wind component. D standardisation/imputation is training-only and adjustment is clipped to ±0.75 ft. B/C are clipped to ±0.5 ft. No energy multiplier, neural network or tuned per-record rule.

{table(['Candidate','Dev day MAE','Final MAE','Final day MAE','Final RMSE','Final bias','Within ±0.5','Improved / worsened','New >0.5 over / under'],[[m,fmt(j['development'][m]['dayWeighted']['mae']),fmt(e[m]['checkWeighted']['mae']),fmt(e[m]['dayWeighted']['mae']),fmt(e[m]['checkWeighted']['rmse']),fmt(e[m]['checkWeighted']['bias']),f"{e[m]['checkWeighted']['within05']:.1%}",f"{e[m]['paired']['improved']} / {e[m]['paired']['worsened']}",f"{len(e[m]['paired']['newOver05'])} / {len(e[m]['paired']['newUnder05'])}"] for m in ['A','B','C','D']])}

D's check-weighted MAE reduction is approximately 17.9%. Day-weighted improvement is {e['D']['ci']['improvement']:.3f} ft, paired day-bootstrap 95% interval [{e['D']['ci']['lo']:.3f}, {e['D']['ci']['hi']:.3f}] ft. It crosses zero. Consecutive-day-block sensitivity has six blocks, interval [{e['D']['blockCi']['lo']:.3f}, {e['D']['blockCi']['hi']:.3f}] ft. Uncertainty intervals do not include all target-definition, selection, version and model-run errors. Seven cases worsen; one new overcall and one new undercall exceed 0.5 ft. Large undercalls >1ft rise from one to two despite eliminating three large overcalls. Do not hide that trade-off.

Only four final checks / two days pass the strict source-time screen. Restricting both training and scoring to timely snapshots leaves 36 training checks / 24 days and final MAE 0.380 ft for A versus 0.258 ft for D. Four checks are far too few to validate improvement. The ridge penalty is the already-selected value, not retuned on these four outcomes.

## Best and worst stored cases

{table(['Adelaide day','Actual ft','Stored ft','Error ft','Swell m / s / °','Wind','Version'],[[x['day'],fmt(x['actual']),fmt(x['predicted']),fmt(x['predicted']-x['actual']),f"{x['height']:.2f} / {x['period']:.2f} / {x['direction']:.0f}",x['windCompass'],x['version']] for x in sorted(j['rows'],key=lambda x:abs(x['predicted']-x['actual']),reverse=True)[:10]])}
Best cases and every remaining record can be sorted in the dashboard. The 14 October observation is retained once as exported; later comments about slow 2ft sets do not create extra independent targets or a fabricated typical size.

## Proposed observation improvements on the research branch

- Add optional size scale, what the scalar represents, separate typical/set size, confidence, self-reported observer label and unusual local factors. Shared-password access does not verify an individual identity; this is labelled explicitly.
- Add forecast-valid UTC, source retrieval lead/age, whether data was available before the check, provider issue/true lead when supplied, an exact calculation-source SHA-256 fingerprint and Git code revision when available from COMMIT_REF. Unknown values remain null. Existing provenance/coefficients are retained.
- New details apply only to new checks. Existing snapshots, originalForecast and histories are untouched. Existing reads/edits remain compatible. No production data migration, deletion or save was performed.
- Still needed: archive scheduled forecast issues BEFORE the observation, the complete preceding source sequence, build/deploy revision reliably injected, provider run ID where available, and real buoy timestamp/QC/location/spectra. This has not been deployed or backfilled.

## Recommendation and future evidence

Keep A in production. Lock D and the existing curve as a comparison on new days. Collect both accurate confirmations and corrections on a fixed schedule; record typical waves and occasional sets separately, viewing duration, confidence and unusual banks/local factors. Prioritise west-of-245° days, 225–235° moderate/long-period conditions, N/NE/E compression winds, matched rising/falling tide comparisons and swell ≥14s. Sample complete events across seasons, not only problematic moments. Aim for at least 30 new surf days before the first prospective review, with multiple independent events per target sector; this is a collection target, not a power guarantee. Predefine an operationally meaningful gain and acceptable overcall/undercall trade-offs. Do not tune on that review block and call it a final test.

## Dashboard and limits

Open dashboard.html beside this report directly in a normal local browser. It is self-contained: no uploads, analytics, external assets or network requests. It contains private observations and should not be committed, placed in the public directory or shared publicly. Filters cover version, time block, source timing and direction; tabs show comparisons, bias strata, rule sensitivities and a sortable 100-record audit. The original CSV remains in Downloads, unchanged.

The read-only loopback server is implemented and covered by access-control tests. This session could not connect across the sandbox/browser network boundary; automated browser opening of local file URLs is blocked by browser policy. Therefore no cross-browser visual/responsive QA is claimed. Dashboard script/data interaction tests are supplied; human visual review of the offline HTML remains necessary. No localhost URL is represented as verified working.

## References and scope of scientific claims

- BOM: waves, period and the distinction between sea/swell statistics and individual waves: https://www.bom.gov.au/resources/learn-and-explore/marine-knowledge-centre/waves-and-swell
- Hyndman & Athanasopoulos: rolling forecasting origins and avoiding future training data: https://otexts.com/fpp3/toolbox.html
- Repository baseline 4c943ff; embedded Seaford engine, phase1 wrapper, source/runtime/observation/Beach Check/auth/outlook functions, configuration, fixtures, calibration history and previous local direction experiment were reviewed. Details are in research/accuracy/SOURCE-AUDIT.md.
'''
    for key, title in [('height','Offshore height'),('wind','Wind direction'),('windSpeed','Wind speed'),('tideHeight','Tide height'),('tideRange','Tide range'),('surfSize','Observed surf size'),('directionPeriod','Direction × period')]:
        text+='\n## Appendix: '+title+'\n\n'+table(['Group','Checks / days','MAE','RMSE','Bias','Within ±0.5'],[[x['label'],f"{x['n']} / {x['days']}",fmt(x['mae']),fmt(x['rmse']),fmt(x['bias']),f"{x['within05']:.1%}"] for x in j['strata'][key]])
    (folder/'REPORT.md').write_text(text,encoding='utf-8')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);a=p.parse_args();build(a.folder)
