# Frenchy 3.1: Middleton compatibility fix

Current status: GO for owner release approval. The isolated HTTPS test passed; production is unchanged.

This follow-up supersedes the Middleton blocker in observations-31-qa.md. The earlier QA report remains an accurate record of the pre-fix state.

## Behavior

- Seaford's 48-hour picker still reads only verified, sealed advance archives. Missing, post-observation, stale or corrupt archives are not replaced by a fresh report.
- Middleton retains the existing report calculation and matching-row comparison through the authenticated observation API. It does not use or activate an archive collector. A currently retrieved comparison is explicitly unverified advance evidence, even if its row's valid time is earlier.
- New snapshots and stored records carry forecastEvidence.status as verified-advance or unverified-comparison. Only the server's successful archive resolver can set the former. Legacy/current comparisons cannot assert archived status or retain a supplied archive reference. Original provider retrieval timestamps remain distinguishable from calculation/receipt times; earlier availability remains unknown unless it is verified.
- The form labels unverified comparisons next to the prediction, history repeats the label, CSV adds explicit evidence status, and JSON exports explain that missing historical status is unverified. No historical record is migrated or backfilled. Metadata-only edits retain the original time, snapshot and originalForecast.
- Confirmations and corrections both remain observations. Confidence, typical size and occasional sets remain separate. Unverified comparisons are not described as prospective forecast accuracy. The private prospective evaluation continues to exclude Middleton, whose archives are unsupported.

## Validation

121 Node tests and 11 Python analysis tests passed. Build and research guard passed. Same-input parity remains identical for all 168 hours at Seaford and all 168 hours at Middleton. Public forecast sources, wave/period formulas, auth implementation, archive schedule/collector, retention and environment configuration are unchanged.

Additional regression tests exercise both spots with real signed administrator sessions, anonymous and foreign-origin rejection, save/reread/edit/export, per-location isolation, original metadata preservation and forged advance-provenance rejection. The Middleton comparison test uses the actual unchanged report engine with synthetic source fixtures.

Owner-started loopback browser QA: Middleton confirmed and corrected checks saved/reloaded; edits preserved confidence and quarter-foot typical/set values. Seaford synthetic UI saves remained functional. Both forms and labels fit 320, 360, 390, 768 and 1440 px. Local fixtures are browser-only; these are not cloud or scientific observations. Physical Samsung Internet remains untested.

Read-only production checks preserve the original 333 observation/Beach Check objects and original 31 research records. Frozen Model D and the published production deployment remain unchanged; scheduled Seaford archiving remains healthy. No production write or archive invocation was performed.

## Release gate

The local Middleton blocker is fixed. Production remains NO-GO until this revision passes an isolated authenticated HTTPS preview and the owner separately approves a release. No merge or deployment is authorized by this document. The current mission explicitly says not to deploy until approved; preparing a new immutable HTTPS preview therefore requires preview-only approval. Existing preview credentials and deploy-specific synthetic stores must be used, never production data/secrets. Automatic collection must remain disabled in the preview and unchanged in production.

## Authenticated HTTPS verification completed

The owner subsequently approved the isolated preview only. Runtime commit 22884be was deployed to the existing separate phone-preview project as draft deployment 6adaf72d8c6e269ee93f0e0c. Preview URL: https://research-pr74--frenchy-phone-preview-20261003.netlify.app/observe (Middleton: /observe-middleton). It was not published to production or merged.

All 12 hosted test groups passed across 51 requests: anonymous rejection, login and secure host-only cookies, wrong password, foreign origin, forged/expired sessions, the 47-hour Seaford archive lookup, both confirmation/correction statuses at both spots, cloud reread/edit/export, frozen snapshots, production-ID isolation, protected assets, disabled preview collection and logout. Two clearly marked synthetic archive fixtures were seeded only into the deploy-specific private preview store. They are not real forecasts or timer executions. No actual observation or research data was copied.

Browser tests on the actual HTTPS origin also passed: login; historical Seaford selection/save/reload/edit; current Middleton confirmation/save/reload/edit with the unverified label; confidence and distinct typical/set fields; and both authenticated forms at 320, 360, 390, 768 and 1440 px. The authenticated research panel confirmed disabled preview collection and no real research/model imports. No browser warning/error console messages were captured. A separate synthetic legacy Middleton cloud record retained its old UTC time and snapshot through a metadata edit.

Preview storage audit: 17 small test objects, 223964 logical bytes, all observation identities explicitly synthetic. No paid service, subscription or auto-recharge was enabled. The before/after production audit again matched all 333 original observation/Beach Check objects and all 31 original research records, with unchanged hashes, published deployment and frozen Model D. Automatic Seaford archiving remained healthy and unchanged.

Final recommendation: GO for owner review and separate production-release approval. The Middleton blocker and authenticated HTTPS gate have passed. Physical Samsung Internet/device-keyboard testing remains an explicit limitation; phone-sized Chromium browser testing passed. No production merge or deployment is authorized by this recommendation.

Known existing usability issue: the observation stylesheet hides the Log out header button at phone widths. Desktop browser logout and API cookie clearing passed; the unchanged mobile hiding rule predates this PR. This is recorded separately from the resolved archive/observation blocker.
