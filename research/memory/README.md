# Permanent research memory

Start here before proposing forecast changes. This builds on draft PR #72, not a replacement analysis. The public production model is unchanged. The scheduled collector and hosted dashboard have **not** been deployed or activated.

## Two layers, one history

The public repository holds code, a non-sensitive topic catalog, validation contracts, protocols and sanitized consultation reviews. It must never hold raw observations, populated dashboards, fitted parameters, individual observation dates/IDs or private analytical results.

The owner-controlled private repository is located through `FRENCHY_RESEARCH_HOME`, otherwise the sibling `frenchy-research-private` directory. It has its own Git history and no remote by default. Original evidence files are byte-preserved (`* -text`); each event and evidence reference has a SHA-256 fingerprint. Events are individually created with exclusive writes; duplicate IDs, replacement content and invalid relationships are rejected. The private ledger imports the existing PR72 analysis rather than fitting or fetching historical weather again. Earlier Phase 2 candidates, the documented owner retention decision, and buoy/history limitations are preserved as distinct historical studies with their original protocols. Its initial import preserves all original observations and snapshots, models A–D, rejected experiments, uncertainty, timing limitations, earlier smoothing experiments and calibration decisions.

Never replace an original conclusion. Append an `evidence-update`, `finding`, `experiment` or `decision` with a new ID and a `supports`, `contradicts`, `qualifies` or `supersedes` relationship. Superseding does not delete or hide the original event. Include source references/hashes, model versions/fingerprints, relevant observation IDs/dates, check/day counts, signed error convention, uncertainty, regressions and limitations. Unquantified uncertainty must be stated explicitly. Use `validateMemoryEvent` in `netlify/lib/research-core.mjs` as the executable schema. New numerical experiments should register their protocol and freeze parameters before new evaluation begins.

```powershell
node research/memory/cli.mjs verify ../frenchy-research-private
node research/memory/cli.mjs append ../frenchy-research-private C:/private/new-finding.json
node research/memory/cli.mjs commit ../frenchy-research-private "Append new evidence and decision"
```

Run verification before and after each append. Commit every accepted append. Git is a version history, not a substitute for an owner-controlled private backup. Do not add a public remote. A disk failure can lose a local-only repository; make an encrypted/private backup of the complete repository, including `.git`. No backup service or paid subscription is provisioned here.

For a fresh approved copy of the same PR72 material, the one-time `import-pr72 PRIVATE_DIRECTORY ANALYSIS_JSON ORIGINAL_CSV` command verifies the source hash and expected historical export format. It refuses to overwrite existing evidence. Later exports become new evidence/events; they must not replace the initial import.

## Private review interface

`npm run research:preview` opens a read-only server at `http://127.0.0.1:4187/research`. `/research/accuracy` reuses PR72's historical charts; `/observe` is a clearly labelled synthetic, browser-only form test. There are no provider requests or database writes. Foreign Host/Origin requests and non-GET requests are rejected. Loopback restriction is for the owner at their computer; it is not multi-user authentication. Do not expose this server on a network interface or tunnel it publicly. If the tool environment cannot expose localhost to the desktop browser, run `research/memory/Start-Preview.ps1` in normal Windows PowerShell.

Keep that PowerShell window open while reviewing the pages. The launcher runs the server in the foreground and prints READY only after both `/research` and `/observe` return HTTP 200. Closing the window or pressing Ctrl+C stops the preview.

After an approved Netlify deployment, `/research`, `/research/accuracy`, every `/api/research` view and every write require the **existing observation administrator session**. HTML and JSON are private/no-store/noindex, including error and login responses. The ordinary public report never imports experimental inference. Dashboard templates contain no private data. Research models/results use a private site-wide Blobs store. Preview stores have deploy-specific names and the new research endpoint never reads production observations outside production context. No new authentication credentials are created.

Hosted findings can be appended in the dashboard. Download its private backup and run `cli.mjs import-backup PRIVATE_DIRECTORY EXPORT_JSON`, verify and commit to the private Git history. The backup includes original hosted events, model artifacts, historical analysis and archive receipts; immutable compressed payloads remain in private Blobs and require a separate owner-controlled store backup for disaster recovery. Export observation records separately through the existing /observe CSV/JSON controls; they remain in their original store. The dashboard API does not silently sync to GitHub. Hosted Blobs provides durable append-only storage through this application; owner access to Netlify storage can still change data, so retain the separate Git/evidence backup.

## Frozen Model D and independent archives

The private Model D artifact stores the **exact PR72 final fitted state**, training IDs/days, development protocol, source hashes and freeze timestamp. It does not retrain. JavaScript inference reproduces the Python feature order, training-only medians, scaling, residual clip and output clamp. Historical labels did not distinguish typical waves from occasional sets; this target limitation remains visible. New comparisons score explicitly defined typical local surf size, retaining sets separately. No historical records are relabelled to create that definition.

The scheduled function is guarded by `RESEARCH_ARCHIVE_ENABLED=true`, a published production invocation, trusted site identity and an already-frozen artifact. Invocation context supplies deployment identity; build environment values cannot opt previews into production. It runs at 00:15, 03:15, … UTC only after approval. Each slot uses an atomic lock to avoid duplicate provider calls. It obtains the existing Seaford provider inputs, executes the existing engine, privately computes D, and stores compressed raw source, hydration/output, tide tables, exact page/helper sources and artifact. A receipt is sealed **after** durable payload write; failed or timed-out slots cannot become valid forecasts. A timeout may leave a lock/payload without a receipt, which is a gap, never prospective evidence. No historical backfill or beach-triggered archive is permitted. Receipt rows cover the local matching horizon; the complete seven-day forecast stays in the payload.

The matcher selects the newest valid receipt sealed 10 minutes to 6 hours before observation, with a valid-time difference at most 30 minutes and a model frozen before capture. Stale/invalid source, invalid timestamps, observation-triggered origins and missing fingerprints are excluded. Provider run issue time stays unknown when unavailable; archive lead is distinct from provider lead. The dashboard recomputes joins from immutable receipts without changing observations. It separates exact production/D fingerprints, check/equal-day weights, day bootstrap and contiguous-day-block sensitivity. Contiguous-day blocks are only a dependence proxy. No automatic model adoption, coefficient updates or retraining exists.

## Observation collection

The existing optional PR72 fields are reused. Typical/set inputs and confidence are easier to reach on a phone; quality, local factors, target definition, observer label, timestamps and snapshot provenance remain optional/preserved. The `Looks right` action records an explicit `confirmed` validation status with the model's unrounded numerical value; intentional corrections record `corrected`. Older/API clients remain `unspecified`. This observation log does not create Beach Check overrides. Existing shared-password sessions do not establish an individual observer's identity; optional labels remain explicitly self-reported. Model/provider timestamps are not invented.

Collect ordinary successes and weak forecasts using convenient predetermined times, while increasing coverage for the topic catalog's sparse conditions. At least 30 new eligible Adelaide days is the first review milestone. Require a useful improvement interval, event sensitivity, condition coverage and a larger-surf undercall review before recommending any model change. Thirty days alone is insufficient evidence.

## Future Codex workflow

1. Read root `AGENTS.md`, this guide, `catalog.json`, PR72's source audit and protocol.
2. Verify/read the private ledger. If unavailable, state that limitation and do not claim consultation.
3. Check prior negative results and contradicting evidence before selecting an experiment.
4. Freeze the new protocol/parameters; keep historical and prospective evaluations separate.
5. Append private evidence and conclusions, then verify and commit the private repository.
6. Add a new sanitized consultation review and run `npm run research:guard` (base defaults to `origin/master`; override with `RESEARCH_BASE_REF` or a CLI ref). Only reviews changed in this diff satisfy the guard. The guard is conservative at the file level; it does not itself prove scientific validity or authorize deployment.
7. Run `npm test`, Python PR72 tests and `npm run build`. Follow `DEPLOYMENT.md` only after explicit owner approval.
