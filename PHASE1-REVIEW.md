# Phase 1 local review — 5 September 2026

## Open the preview

- Review selector (four desktop/mobile views): http://127.0.0.1:8790/review.html
- Seaford: http://127.0.0.1:8790/
- Middleton: http://127.0.0.1:8790/middleton.html
- Same-input size comparison: http://127.0.0.1:8790/comparison.json
- Developer trace: add ?debug=1 to either spot page and expand the developer panel near the bottom.

These URLs work on this computer. The preview listens only on loopback, blocks writes, and does not use the Netlify deployment CLI. To restart after a reboot, open a terminal in this project and run:

    node preview-phase1.mjs

Keep that terminal running. No production credentials are required.

## Safety and baseline

- Repository: https://github.com/rireou/frenchy-surf-report.git
- Branch: phase1-report-improvements
- Baseline/current Git commit: 82bf9f5734808186052ec3f921e308a06be30b9b
- Phase 1 changes are local and uncommitted. No push, merge or deployment was performed.
- No coefficient retuning, 220-degree rule change, automatic calibration or Phase 2 work.
- The separate frozen 14-day experiment was not changed.

## Visible changes

- Replaced both Local Guide cards with concise location-specific paragraphs and a link to the other report. Removed the beach-check claim and inline coaching promotion; the separate header Coaching link remains.

- Forecast confidence and Frenchy Beach Check boxes removed from both spots at Robin's request on 6 September. Beach Comfort remains; unused sidebar rows are removed.
- Quality uses the existing spot-specific descriptive label, separate from confidence.
- Unknown wind is labelled unknown; unavailable size is not shown as flat.
- Consistent single ft unit; window endpoints retain minutes and cannot form the old 6 PM–6 PM label.
- Best-window and cleanest-window selection stays within daylight; after daylight the main recommendation says to check the next day.
- Actual sunrise/sunset is requested. If unavailable, planning uses an explicitly documented conservative 8 AM–4 PM fallback.
- Full Adelaide forecast date/time on both spots, including Middleton where it was missing. Explicit time buttons select their requested hour; Now is no longer clamped to daylight hours.
- The public beach-check fetch and display helpers are removed. Stored observations and backend endpoints are preserved.
- Larger mobile text, 15px/44px time buttons, and best time above wind/tide on mobile. Existing visual identity preserved.

## Backend / diagnostics

- Null-safe wind fallbacks in server and browser paths; weather fallback uses matching forecast hours, not current wind copied across future hours.
- Server stale fallback remains limited to one hour; browser stale fallback is now limited to one hour too, retaining saved timestamps.
- When required wind is missing, hourly size/quality is withheld rather than running calm-dependent rules. Actual measured/modelled zero wind remains a valid value.
- Each valid hourly report has a size trace, selected component, raw inputs, rule results, final value, and provenance. Missing-wind rows record why calculation was withheld.
- New pipeline version; original coefficient-version label and exact baseline commit retained. Provider model-run issue time is null when not supplied, not invented.
- Observation snapshots include trace/provenance. Original forecasts and replaced-snapshot history are retained on subsequent observation edits. Missing predicted values cannot be saved as zero.
- Local comparison executes baseline and Phase 1 against the same source inputs.
- Local bundle manifest includes the shared helper; no Netlify production settings were changed.

## Verification

- 30 tests passed, including all pre-existing tests. Original numeric fixtures retained; parity assertions explicitly account for approved confidence/version/window-text changes.
- Final live comparison: Seaford 168 hourly rows, 0 changed; Middleton 168 hourly rows, 0 changed.
- Desktop: both spots checked at 1440x1000.
- Mobile: both spots checked at 390x844; no page-width overflow; time buttons checked at 15px and 44px high.
- Middleton 6 AM selection changes size, wind, tide and forecast-time label together.
- Debug panel populated; review-page mobile switching and all four time buttons verified.
- No errors in final browser checks; final server error log empty; final forecast-source warnings empty.
- Earlier preview port conflict and transient fetch errors were resolved before handover. Normal Git CRLF conversion warnings are not application errors.

## Limits / review notes

- Hourly size mathematics is unchanged for complete inputs. Displayed current/daily values can select different hours following the time/daylight fixes.
- Missing-wind behaviour intentionally differs: unknown/unavailable instead of fabricated calm/flat.
- Source/model run identity is limited to metadata supplied by the existing APIs.
- Observation writes are intentionally disabled in the preview; production database mutation was not used to test this work.
- Confidence remains unvalidated. Passing software tests does not establish forecast accuracy.
- Historical charts still show all 24 hours; those are not nighttime surf recommendations.

STOP: await Robin's review. Do not deploy, push, merge or start Phase 2.
