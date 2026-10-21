# Production-readiness review — 21 October 2026

Scope: PR73 and its PR72 dependency. This review authorizes no merge, deployment, environment update, paid service, private import or automatic collection. Production remains on `4c943ff0a2f0eca3e1531949b378d93089ce7087`.

## Recommendation

GO for an owner-approved isolated HTTPS verification deployment with collection disabled. NO-GO for unattended collection or claiming a fully verified production release until the hosted checks below pass. Local and SDK-level checks cannot certify a not-yet-deployed HTTPS function, actual cloud conditional writes or a real scheduler invocation.

## Dependency and release integrity

PR73 contains PR72 head `27cc3d06ef530c04413879785f6e920d4f133155` as an ancestor, including its original three commits. PR72's analysis/protocol, source audit, dashboard, provenance helper, observation fields and tests remain included. Later edits to the form, exports and dashboard are additive or documented fixes. No production calculation coefficients, provider selection, Seaford/Middleton formula files, authentication secret logic or Beach Check code changed.

PR73 is prepared to target `master` directly for one combined review, retaining PR72's three commits as ancestors. This avoids a merge into the research dependency branch being mistaken for a production release. Never deploy PR72 alone as the completed research-memory release. Netlify currently auto-publishes `master`; therefore a future merge must be treated as production release authorization, even if a skip directive means an explicit deployment is subsequently needed. Verify the combined tree SHA before publication. `[skip netlify]` remains on preparation commits and the draft.

## Authentication and privacy

- The actual research handler rejects missing, forged, expired and unconfigured administrator sessions before storage access. Every research view, historical export, backup and direct function URL requires the existing signed session. Cookies remain host-only, HttpOnly, Secure and SameSite=Strict. Existing authentication code and environment values are unchanged.
- POST requires same origin, rejects malformed/oversized input, and immutable storage rejects overwrites. PUT/DELETE are absent from the research API. Storage failures return a generic no-store error. Research responses carry private/no-store, noindex/nofollow, nosniff, a restrictive referrer policy and frame-ancestor protection.
- Production research and observation namespaces are available only to the current published production invocation. Deploy Previews, branch deploys, obsolete production permalinks and missing context use isolated namespaces. Context is supplied by Netlify, never inferred from a caller-controlled request or build environment value. Read/write isolation is exercised through the actual observation handler using synthetic stores and valid signed sessions.
- This isolation guarantee applies to builds containing these guards. Older immutable deploys retain their earlier code and shared-password access rules; this branch cannot retroactively patch them. Do not use an old preview URL for observation tests. Use the newly approved isolated preview and avoid opening legacy observation/admin routes during testing.
- The account has an existing shared administrator password; it is not individual identity or MFA, and existing login rate limiting is not expanded by this change. Self-reported observer labels remain unverified. Do not claim per-observer authorization.
- New checks retain explicit confirmed/corrected status. An edit that changes size, time or prediction preserves original research metadata in revision history and clears ambiguous replacement targets/status. Legacy records gain no invented historical fields. Only intentional edits would execute this path; this audit performs none in production.
- Original evidence, fitted artifacts, account details and populated dashboards stay outside public Git/deploy assets. Public templates have no data. The local /observe preview is a synthetic UI fixture, not a hosted authentication or production-storage test.

## Schedule, storage and cost controls

Cron is `15 */3 * * *` UTC: eight slots/day. Collection requires the explicit archive flag, published production context, trusted site identity and a previously registered frozen model. Missing model/disabled context produces no provider calls. Slot locks prevent duplicate fetches. Payloads precede immutable sealed receipts; stale sources, wrong times, failed writes and missing fingerprints cannot qualify for prospective evaluation. Gaps are never backfilled.

Read-only Netlify inspection confirmed the archive flag, archive function and research store are not currently present. Existing observation and Beach Check stores were inspected by namespace only, without modifying or downloading records. Account plan, current allowance and disabled auto-recharge were checked privately; the owner-only report records values. No upgrade or purchase is needed for the proposed controlled test. Recheck headroom before activation and do not enable recharge.

At eight 30-second runs/day and default 1 GB, compute is at most about 20 credits per 30-day month, excluding cold invocation overhead, dashboard usage, transfer and the rest of the account. One production release is currently 15 credits. Seven provider URLs per slot means about 1,680 calls/month. The 500 KB compressed cap bounds 90 days of payloads to about 360 MB plus metadata. These are workload estimates, not an unlimited-storage or uninterrupted-service guarantee. The collector is optional: exhausting a shared account allowance can affect the public site, so stop collection before that happens. Costs and plan behaviour are linked in DEPLOYMENT.md.

## Remaining hosted verification gates

Completed locally: 94 Node tests and the existing Python analysis suite, same-input 168-hour comparisons against the deployed engine for both spots, private evidence/Git restore verification, and Netlify function packaging. Netlify's packager detected all ten functions, the three research routes and the scheduled UTC expression; required HTML/helper/tide files are present in the ZIPs. A decompressed package scan found no private observation IDs or populated evidence assets. This is packaging validation, not a hosted deployment.

1. Obtain approval for an isolated HTTPS Deploy Preview with collection disabled. Validate actual routing, login/logout, expired/forged-cookie rejection, no-store/noindex, direct function URLs, public static assets and cross-origin rejection.
2. Use synthetic observations only in its isolated namespace. Check create/read/export/edit isolation and permanent confirmed/corrected snapshots. Verify no production store keys change.
3. With an approved private import/test action, verify real Blobs write/read/hash, exact replay and conflicting overwrite rejection; verify backup restoration. A mocked SDK request is not a live cloud storage test.
4. Inspect the deployed function's Scheduled badge, UTC cadence and next run. Keep the flag absent: manual or scheduled disabled invocations must make no provider requests or writes. Confirm runtime/context, included assets, timeout and logs. A live provider/archive run requires separate explicit approval; do not silently enable the flag to test it.
5. After passing those gates, seek approval for the combined production release with collection still disabled, private seeding and post-release smoke checks. Seek separate approval for automatic collection only after storage/scheduling evidence and current credit headroom are recorded.

## Rollback preparation

The owner-only report records the current exact published deployment and commit. Before release, reconfirm that target is still current and export/verify a private backup of observations, ledger, model and archive payloads. No data migration is required.

On a release failure, stop/disable the collector first; runtime environment changes may need a new deploy and must not be assumed instantaneous. Re-publish the recorded pre-research deployment, which contains no collector at all, and verify the public reports and observation history. This definitively removes the new scheduling code even if a flag update has not propagated. Preserve both site-wide stores and all payloads; do not delete research or observation keys. A synthetic handler replacement/immutability drill passes locally; an actual Netlify rollback is deliberately not executed during preparation. Pause the release if live rollback would delete or migrate data.
