# Private Seaford accuracy research

This directory contains reproducible tools, not observation data. Production baseline is 4c943ff. No experiment is imported by public reports. Do not deploy this branch without review.

Use Python 3 with NumPy and Adelaide timezone data. Example, from the repository root:

```powershell
python research/accuracy/analyse.py C:/private/seaford.csv ../private-accuracy
python research/accuracy/build_review.py ../private-accuracy
python -m unittest discover -s research/accuracy -p test_analysis.py -v
npm test
```

The output directory must be **outside the repository and Netlify publish root**. The CSV is read-only. The analysis produces per-record validation, all metrics/strata, fitted models, partition/fold provenance, clustered intervals and private reports. Re-running with the same export produces the same model results.

Open the resulting dashboard.html directly in a normal browser for an offline, self-contained interactive view. It embeds private records: keep it private. Nothing is uploaded, no external assets/analytics are used, and no production database is contacted. Browser automation in the current session could not reach the loopback preview or open local file URLs; visual QA remains pending.

Optional server: `node research/accuracy/server.mjs ../private-accuracy/analysis.json 4185`. It binds to127.0.0.1 only, accepts GET only and blocks foreign Host/Origin headers. Do not change it to0.0.0.0 or expose it as a public service. It provides local-only restriction, not a multi-user authentication service. A hosted dashboard would need the existing admin session gate and server-side access controls before any private data is exposed.

Protocol and limitations are explicit in PROTOCOL.md and SOURCE-AUDIT.md. A is the saved historical forecast; it is not a reconstructed current engine run. B/C/D are local residual experiments. Current/earlier versions, timely/retrospective inputs and typical/set uncertainty must remain distinguished.

Future observation fields are optional: target definition, typical/set sizes, confidence, self-reported observer label, local factors and source/provider timing. Their implementation does not infer historical values or change existing observations. An exact SHA-256 fingerprint of the calculation source is captured independently of deployment metadata. Git code revision is null unless a genuine40-character COMMIT_REF is supplied; provider lead time stays null when unavailable.
