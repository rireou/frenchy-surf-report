# Review, costs, activation and rollback

No deployment, live environment changes, database writes or purchases are performed by this branch. PR72 is an unmerged predecessor; review this branch against it to avoid duplicating its work. Preserve the current production deploy ID and source commit before any approved activation.

## Current infrastructure evidence (21 October 2026)

[Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/) are available on all plans, run automatically only on published deploys, use UTC cron and have a 30-second limit. Deploy previews require a manual run; the implementation additionally disables archives outside production. No external cron subscription is required.

Production/deploy identity comes from the trusted [Functions invocation context](https://docs.netlify.com/build/functions/api/) (`context.deploy.context`, `context.deploy.published`, and `context.site.id`), not an assumed build-only `CONTEXT` environment variable. Collection requires a published production invocation; previews cannot override that guard with an environment value.

[Credit pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) currently gives the Free plan 300 monthly shared credits with a hard limit. Compute is 10 credits/GB-hour; production deploys cost 15 credits and previews zero; web bandwidth and requests also draw from the shared pool. [Default function memory](https://docs.netlify.com/build/functions/configuration/) is 1 GB. Account-specific plan/remaining credits have not been verified by this implementation; no unlimited-free reliability promise is made. Check the owner's existing plan and usage before activation, without enabling auto-recharge, adding a card or upgrading.

Eight calls/day is about 240/month and at most 720/90 days. At the 30-second timeout and default 1 GB, the scheduled function's compute upper bound is about 2 GB-hours/month, or **20 compute credits**; actual runtime can be much shorter. This is not the total account bill. It excludes existing site usage, dashboard invocations, private storage/transfer/reads and deployment usage. Seven existing provider URLs per archive is up to about 1,680 requests/month; this collector does not poll buoys or add extra providers. A 500 KB compressed payload cap limits 90-day payload growth to about 360 MB, plus receipts/metadata; archives are not automatically deleted. Dashboard reads increase with stored evidence. Review usage monthly and revisit pagination/retention before indefinite accumulation. Retain historical evidence privately even if a future archival tier is introduced.

[Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) is included across plans; it is not an unlimited free SLA. Conditional `set(..., {onlyIfNew:true})` requests enforce immutable keys. The pinned SDK's JSON convenience method does not forward its conditions correctly, so the research adapter serializes JSON through `set`; a test verifies the actual SDK sends `If-None-Match: *`.

Free-plan exhaustion, provider failure and a 30-second hard timeout can create gaps. Gaps stay visible; they are never backfilled or represented as advance forecasts. If the existing free allowance proves insufficient, keep collection disabled and discuss lower cadence/manual timestamped collection or an owner-approved plan. Do not activate paid services. This is a best-effort free-plan-compatible archive, not guaranteed continuous coverage.

## Before deployment approval

- Verify private ledger/evidence and back it up. Run full Node/Python tests, build, 168-hour same-input parity and private JS/Python D parity.
- Finish actual desktop/mobile browser tests. A localhost server that cannot be reached from the browser is a blocker to browser QA, not a successful test.
- Inspect authentication/no-store behaviour and preview isolation. The existing public report, Coach and observation databases are separate from the new research store.
- Commit only sanitized code/docs. Use `[skip netlify]` on development commits/PR to avoid automatic previews while deployment is unapproved. No production environment variable is changed by a commit.

## After explicit owner approval

1. Merge the reviewed PR72 dependency and this reviewed change, or rebase onto the approved baseline. Record production rollback deploy/commit. Deploy with collection **disabled**.
2. Check public Seaford/Middleton, observation login/history, protected `/research` and `/api/research` unauthorised rejection. Validate forecast parity, mobile form and existing features. No forecast endpoint imports D.
3. Using the authenticated private research API, register the verified immutable `models/model-d-v1.json` artifact from the private ledger; import the existing PR72 analysis once and append ledger events in dependency order. These are private imports, never static files, environment values or public GitHub attachments. Use owner-controlled session credentials; never paste them in the repository or logs. Preview imports stay in deploy-specific research storage. Export/verify the imported hashes before continuing.
4. Only after approval for activation, set `RESEARCH_ARCHIVE_ENABLED=true` in production Functions scope and redeploy as required for environment changes. Do not alter existing forecast/auth/provider variables. A seeded frozen model is mandatory before provider requests begin. The scheduler will start prospectively; old checks remain historical.
5. Observe a real scheduled run: check slot, payload hash, seal timestamp, calculation fingerprints and latest-archive age. Confirm an unauthenticated request cannot retrieve data and no record was written to Beach Check. Make the first genuine observation after a valid archive; verify its classification and typed typical/set definition.
6. Monitor gaps, credits and provider rate limits in the existing account. Download private memory backups and commit new evidence to the private Git ledger. Before any model promotion, review uncertainty, related events, sparse strata and new dangerous undercalls. No automated promotion exists.

## Rollback

Disable the archive flag first, then restore the previous production deploy/commit. Preserve the private site-wide research store, all historical observations, immutable payloads and local Git ledger. Do not delete or migrate production observations. Existing optional new fields remain compatible with older readers. A site-wide store persists across deploy rollback; default-disabled guards prevent an old/manual preview from continuing production archive writes. No DNS or main Surf School website changes are needed.
