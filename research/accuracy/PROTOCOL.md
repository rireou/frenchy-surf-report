# Seaford accuracy study protocol — 21 October 2026

Local research only, based on production commit 4c943ff. No changes to the forecast engine or historical records. Raw exports and results must stay outside the repository and deployment directory.

## Targets and baselines

Score the stored numerical prediction against the stored observed scalar, in feet. Do not reinterpret it as a measured significant wave height, typical surf or occasional sets: those definitions were not collected. A is the **forecast stored at the time**, not a replay of today's model. Report the two version labels separately. Historical versions may have been tuned using these same observations; no portion can be certified as a pristine prospective holdout.

## Validation fixed before candidate scoring

- Sort by observation time in Australia/Adelaide and group entire calendar days. Last ceil(20%) days form a chronological evaluation block. Freeze this partition before fitting. Exclude training observations within 48 hours before each evaluation block.
- Development: expanding origins, initial 12 days, five-day validation blocks, same 48-hour embargo. Fit using earlier days only; equal weight per day. Final evaluation is not used to select a model or hyperparameters. Report day-weighted and check-weighted errors, version subsets and source-time-sensitive subsets.
- A: historical stored forecast unchanged.
- B: scalar calibration, half the day-weighted mean residual, clipped to ±0.5 ft.
- C: B plus shrunken directional residuals in fixed sectors <215, 215–225, >225–235, >235–245, >245 degrees. Require five training days in a sector, shrink by n_days/(n_days+8); total adjustment clipped to ±0.5 ft.
- D: ridge regression on residuals using stored prediction, direction, period, local wave height and onshore wind component; intercept included. Standardise using training data only; missing features use training medians. Choose penalty from 1, 10, 100 using development day-weighted MAE; adjustment clipped to ±0.75 ft. No energy multiplier, no target-derived feature, no weather refetching.
- Clamp experimental outputs to 0–6 ft, matching the existing engine's range. All candidates score the same rows.
- Paired day-cluster bootstrap with fixed seed, 2,000 resamples, for uncertainty in MAE improvement. Also group consecutive observed days as a dependence sensitivity, not a claim to have identified physical swell events. Small event counts limit inference.
- Report new overcalls/undercalls exceeding 0.5 ft, large errors >1 ft, all regressions and unsupported conditions. Diagnostic strata are exploratory and subject to multiple comparisons.

## Rule diagnostics

Use frozen traces and existing calculation outputs. Subtracting a trace delta is an **arithmetic sensitivity only**: downstream gates could change in a true counterfactual. No historical weather regenerated. Missing six-hour wind/Gulf memory means a full current-engine replay is not established.

## Adoption

An apparent retrospective improvement is insufficient for production. Keep A until a locked candidate improves on new, prospectively collected days with consistent target definitions and complete source provenance. Middleton remains unchanged.
