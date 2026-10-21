# Frenchy Surf Report research continuity

Before proposing or modifying any forecasting formula, coefficient, provider, driver selection, tide/wind adjustment, floor, cap or nowcast rule:

1. Read `research/memory/README.md`, `research/memory/catalog.json`, `research/accuracy/SOURCE-AUDIT.md` and `research/accuracy/PROTOCOL.md`.
2. Open the private research ledger using `FRENCHY_RESEARCH_HOME`, or the sibling `frenchy-research-private` directory. Run `node research/memory/cli.mjs verify <private-directory>`. Consult the original findings, supporting evidence, negative experiments, contradictions and decisions. If private evidence is unavailable, state the limitation; do not claim to have consulted it.
3. Preserve the production baseline. Do not retune on an evaluation block and relabel the results independent. A stored historical prediction is not necessarily today's model or a verified advance forecast.
4. Append a new finding or experiment with model versions/fingerprints, dates, evidence hashes, checks/days, uncertainty, regressions and limitations. Never replace or delete earlier findings. New evidence must link to the finding it supports or contradicts.
5. Add a sanitized review record under `research/memory/reviews/` identifying consulted finding IDs, the private ledger digest and why the proposed change is justified. `npm run research:guard` checks this requirement when production calculation files change.
6. Keep private observations, individual dates/IDs, snapshots, fitted parameters and populated dashboards out of public GitHub and public assets. Private local evidence is version-controlled in a separate Git repository with no remote configured by default. Hosted evidence uses authenticated private storage, never static JSON.
7. Seaford evidence does not authorize Middleton calibration changes. No production deployment, model promotion, paid service, DNS or production-environment change without explicit owner approval.

PR #72 is the predecessor. Reuse its fields, tests, analysis and dashboard. Public catalog entries are pointers/hypotheses, not universal corrections. Read the latest private ledger at the start of every forecast task.
