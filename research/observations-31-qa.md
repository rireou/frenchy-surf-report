# Frenchy 3.1 browser QA and release decision

Status: draft / NO-GO for production. No production deployment, merge, environment change or archive invocation was performed.

## Browser verification

The owner-started loopback preview was reachable on port 60357. Observation saves used synthetic fixtures in browser-local storage only. They did not write to Netlify or alter the private historical evidence.

- Chromium viewports: 320, 360, 390, 768 and 1440 px. Observation form, date controls, loaded research memory and period dashboard had no horizontal page overflow. Wide research tables scroll inside their containers.
- A nearly 48-hour-old Adelaide observation saved with an unambiguous UTC timestamp. Future and older-than-48-hour selections were rejected. Automated tests also cover the exact boundary, four device timezones and Adelaide DST gaps/repeated hours.
- Low, Medium and High confidence values were selected and saved across synthetic checks. Edit hydration and reload persistence were verified. Typical and occasional-set values remained distinct, including quarter-foot precision. A set size smaller than typical surf was rejected.
- Missing historical evidence displayed an explicit unavailable message and disabled save; no later/fresh forecast was substituted. Server tests separately verify archived payload hashes, authority, pre-observation sealing and invalid archive rejection.
- Research search, experiment filtering, prospective and archive panels worked. The local ledger contains the original 31 records plus one appended period experiment. The local panel's archive-disabled label describes this read-only preview only.
- The period direction filter reduced the 60 synthetic scenarios to 12 rows for one direction. The dashboard labels synthetic sensitivity and partial historical arithmetic as exploratory, with regressions and limitations visible.
- No warning/error console entries were captured in the tested local observation/research tabs.

Browser QA found and fixed a synthetic fixture clock displayed in UTC, missing client-side size validation in the demo path, truncated confidence labels and a squeezed custom-date input. The date control now wraps at full width on narrow screens; the ready badge no longer overlaps its label. Public report styling is unaffected.

## Privacy and regression checks

- Local pages returned 200 with private/no-store and noindex/nofollow headers. Unrelated source, environment and evidence paths returned 404. Wrong Host and cross-origin requests returned 403; writes to the local server returned 405.
- All 113 Node tests and 11 Python analysis tests passed. Build and research continuity guard passed.
- Same-input parity passed for all 168 Seaford rows and all 168 Middleton rows against the pre-research baseline. No numerical normalization was applied; explanatory CRLF/LF strings alone were normalized.
- Read-only production verification found the same published deployment, all original 333 observation/Beach Check objects with unchanged hashes, all 31 research events with unchanged ledger digest and the unchanged frozen Model D fingerprint. Nine scheduled archive health slots were sealed with no failures; the latest was the 03:15 UTC run on the QA date. Anonymous production research and observation API requests returned 401. No production data or configuration was written.

## Remaining release blocker

The collector currently archives Seaford only. The new historical-only snapshot path therefore rejects every new Middleton snapshot. This would disable new Middleton observation saves in a production release. Existing historical records and metadata-only editing remain supported. The local synthetic Middleton fixture is not evidence that the real Middleton archive path works.

Do not merge or deploy this draft until Middleton recording is preserved without inventing historical forecasts. A reviewed solution must either provide genuine sealed Middleton archives or explicitly retain unmatched human observations without claiming a matched prediction. Do not fall back to a forecast retrieved after the observation.

## Limits and recommendation

This was desktop Chromium at phone-sized viewports, not a physical Samsung Internet or Android keyboard test. The loopback preview deliberately does not use live sessions or cloud storage. New 3.1 HTTPS cookie/session behavior still requires an isolated authenticated preview before production approval.

Keep the production period rules and Model D status unchanged. Controlled 9/14-second sensitivity and the limited historical evidence do not demonstrate a reliable improvement. Keep gathering prospectively archived observations with explicit typical/set measurements and confidence. Automatic collection and retention were not changed.
