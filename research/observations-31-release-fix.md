# Frenchy 3.1: Middleton compatibility fix

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
