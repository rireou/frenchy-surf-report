# Frenchy Surf Report

Current Seaford, Adelaide Mid Coast and Middleton surf-report pages.

## Safe publishing workflow

1. Work on an `agent/*` branch.
2. Open a draft pull request.
3. Check the Netlify Deploy Preview, no-JavaScript HTML, JSON and tests.
4. Merge only after Robin explicitly approves the production release.

## Canonical report architecture

`netlify/functions/surf-report.mjs` provides the HTML and JSON routes. On each uncached request it obtains current Open-Meteo source data, loads the tide table and runs the calculation code from the existing page through `netlify/lib/report-runtime.mjs`.

The resulting canonical report object is the source for:

- initial crawlable HTML;
- browser hydration and the visible interface;
- JSON endpoints;
- JSON-LD;
- observation snapshots;
- freshness metadata.

Netlify may cache a response for five minutes. The body always includes `issued_at`, `valid_until` and `status`. A source result is current for 20 minutes. Older data is `expired`; missing verified data is `unavailable`.

The Seaford and Middleton calculation formulas remain in `index.html` and `middleton.html`. The server executes those exact formulas, and the fixed fixtures in `tests/fixtures` protect their numbers, rounding and labels.

## Routes

- `/` — canonical Seaford report
- `/middleton.html` — canonical Middleton report
- `/surf-reports` — report discovery page
- `/surf-report/mid-coast` — regional Mid Coast report
- `/surf-report/south-port` — regional Mid Coast values, clearly not spot-calibrated
- `/surf-report/moana` — regional Mid Coast values, clearly not spot-calibrated
- `/surf-report-data` — freshness and methodology
- `/api/surf-reports/index.json` — JSON discovery
- `/api/surf-reports/:location.json` — canonical report JSON

## Validation

Run:

```powershell
npm.cmd test
```

The parity tests compare fixed marine, wind and tide inputs with the pre-refactor Seaford and Middleton outputs.
