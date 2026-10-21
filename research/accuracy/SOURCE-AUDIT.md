# Production calculation audit

Baseline: `4c943ff0a2f0eca3e1531949b378d93089ce7087`. Research branch: `codex/seaford-accuracy-audit`. No coefficient changes are part of this branch.

## Repository architecture

The public entry points are index.html and middleton.html. Their embedded calculation code is executed on the server by report-runtime.mjs; phase1-engine.js adds instrumentation, null-wind guards and provenance. surf-report.mjs renders canonical HTML, JSON and observation snapshots. report-source.mjs caches source requests for four minutes, allows a one-hour marked-stale fallback and leaves numerical calculations to the page engine. Public canonical status is time limited. inline-state.mjs transports complete state losslessly. UI versions/branding/analytics affect presentation rather than swell transfer. outlook.mjs reuses calculated hours; outlook-notes.mjs can supplement outlook text without changing hourly sizes. Tests cover fixed numbers, calibration gates, time selection, refresh, rendering, SEO and bundle dependencies.

seaford-data.js requests seven-day Open-Meteo marine/wind/weather data at offshore (-36.05,136.70) and local (-35.19,138.48) points, plus four Gulf check cells. Local uses sea-cell selection. Optional weather wind fallback matches the same hour; missing wind remains missing. The local Gulf cell is reused rather than requested twice. wave-buoys.js is a separate AODN/WFS retrieval path; the Seaford size calculation does not simply multiply forecast height by a live buoy ratio.

Observation storage is separate from Beach Check storage. surf-observations.mjs authenticates with the existing signed, 30-day shared-password cookie, verifies same origin on writes, deduplicates token/near-time repeats, limits three checks/day, saves snapshots and archives replaced values. beach-check.mjs uses its separate store and bearer credential. Local size-correction helpers also exist in index.html; server canonical calculations do not load a visitor's localStorage corrections. Existing sanity-anchor helpers are disabled by an empty checks list. None of those mechanisms is used to fit or publish the research candidates.

## Seaford pipeline and coefficients

1. Combine matching hourly offshore/local/wind/Gulf rows. Require known wind. Build candidates from offshore primary, secondary and wind sea. Score each by **height × directionScore × periodFactor**; select one driver. DirectionScore is a piecewise ranking curve, distinct from the size-transfer coefficient.
2. Ranking period factors: ≤9s 0.75, ≤13s 1.00, ≤16s 1.20, ≤20s 1.35, >20s 1.25; missing uses 0.8. This selects a driver, it is not a second amplitude multiplier in the transfer function.
3. Empirical starting beach feet = offshore height in metres × sector coefficient + additive period bonus, clamped 0–6ft. These coefficients have empirical ft/m meaning; they are not a dimensionless physical transmission solution.

| Direction | Coefficient |
|---|---|
| Outside 200–260° | 0.12 |
| 200–205° | 0.25 |
| >205–210° | 0.32 |
| >210–215° | Linear 0.32 → 0.45 |
| >215–220° | Linear 0.45 → 0.55 |
| >220–<225° | Linear branch 0.65 → 0.75 |
| 225–242° | 1.00 |
| >242–245° | 1.00 for height ≥2.8m; otherwise linear 1.00 → 0.75 |
| >245–250° | Linear 0.75 → 0.50 |
| >250–260° | 0.25 |

At 220° the right-hand branch starts near 0.65 after 0.55 at exactly 220°. At 225° it jumps from near 0.75 to 1.00. Other boundaries exist at 205/210, 250/260 and the height threshold at 2.8m in the west branch. The existing direction-smoothing experiment is useful evidence that continuity merits study, but its partial replays lack complete prior history. No smoothing alternative was silently adopted here.

4. Additive period bonus: ≤9s −0.5ft; >9–13s 0; >13–16s +0.5; >16–20s +1.0; >20s +0.7. Changing driver selection and crossing these thresholds can create output changes without any live suppression.
5. Aligned secondary contribution: primary ≥1.4m, secondary ≥0.7m, within 12° and both in 235–250°. Combine primary feet + 0.55 × secondary feet, clamp 0–6; take maximum with selected-driver size. Despite its name, combinedSwellEnergyFt is an empirical amplitude combination, not H²T energy conservation.
6. W/WNW fallback 260–305° at ≤10.5s is capped to 2ft without local confirmation, 3ft with confirmation. Inside-Gulf floor is local wave metres ×2.6×local-direction fit, minimum fit 0.22 (final range 0.18–1), chop fit ×0.78 above 0.45m wind sea, floors 0.9/1.3ft at 0.4/0.6m when useful fit; max4.5ft.
7. Local storm surf: max of local wind sea, current N/NW fetch and six-hour same-day wind-fetch memory. Memory weights 1,0.9,0.75,0.55 with elapsed hours. Wind fetch starts at 25km/h, piecewise up to about3.4ft before direction fit; wind-wave conversion uses2.05 plus thresholds at0.5/0.8/1.0/1.2/1.5m. Confirmation/direction/future caps prevent unconfirmed big calls. These paths need historical source sequences for a faithful replay.
8. West Gulf limiter starts >242° and tightens at248°, depends on inside-floor confirmation and time of day. Exceptions preserve strong 243–247° swell. An anti-hype suppression ×0.62 requires offshore ≥2.5ft, local wave <0.32m and directionScore<0.25. This is model-cell suppression, not proof of a live buoy trim.
9. Tide: base low-gate penalty1ft below225°,0.5 below235°,0.25 above240°, otherwise0. Apply a −120/+150min low-tide window, weaken by0.62 for confirmed energy or0.45 for strong inside signal; early-push reduction0.55. Directional caps relax with confirmation. High push is up to0.45ft for235–245°, offshore≥2.2ft, high tide≥1.5m and within150min. Storm surf bypasses these groundswell gates.
10. Normal calibration offset is0; conservative −0.5ft; generous +0.5 or+1ft. Study rows use normal.
11. Local/Gulf confirmation and overcheck gates: related local wave/wind-wave/period/floor evidence; Gulf points require wave≥0.7m, windwave≥0.75m or estimated≥1.8ft. Multiple confirming model cells yield high confidence, not independently measured accuracy. Trusted SW can preserve model energy; absence of confirmation caps forecasts above2/3ft.
12. Trusted SW realism cap: ≥2.8m,222–238°,10–13.5s, lacking strong Gulf evidence caps above2.5ft. Final reality trim reduces unconfirmed2.6–3.25ft to2.5 and larger output toward3ft.
13. N/NE/E compression: wind350–100°, non-dominant storm surf, final≥2ft. Subtract0.5ft at12km/h,0.75at18,1at25; strong SW has1.5ft floor.
14. Marginal underfill: 1.75–2.05ft, offshore<2.05, floor<0.6, local<0.55m, local direction>250 and low Gulf confidence →1.7ft, often changing the public half-foot bin.
15. West-fetch floor:16–24km/h from220–265°, aligned local232–258°, local≥0.45m and not pure chop →1.15/1.45ft. Strong230 floor:225–235°,height≥2.75m,8.8–10.8s or qualifying10am–4pm conditions, except very strong compression, can restore2.5ft after a wind trim.
16. August observation calibration: +0.25ft at246–260° with local≥0.4m; otherwise −0.3ft at226–235°/11–14s; otherwise −0.15ft at11–14s. Else-if ordering prevents both period deductions being added together. Then south-edge218–223°,height≥1.8m,8.8–10.5s,wind≤15 floor0.85ft.
17. Recent-Gulf-pulse hold: current day/current-near hour only, confirmed earlier rows within six hours; decay0.25/0.5/0.85ft, confidence caps1.5/2/2.5ft and wind/tide adjustments. It is a **floor**, so cannot itself lower an hourly value. Public rounding has half-foot thresholds (e.g.1.75→2ft) and range labels; chart smoothing is presentation and must not be mistaken for raw model output.

## Existing calibration history and preservation

- `cc8a4ea` (6 Aug): observation-based adjustments.
- `075286e`: marginal underfill trim.
- `166a0ea`: evening west limiter smoothing.
- `82bf9f5` (26 Aug): updated partial-bias calibration and south-edge floor; updated fixed fixtures.
- `b0ca9bb` / `52cf130`: recent Gulf pulse hold and sensitivity.
- September phase1: instrumentation/provenance and missing-data protection, preserving baseline numbers.
- `4178da0`: lossless HTML hydration packing, no forecast change.

The original observation files and snapshots remain outside Git and unchanged. No deduplication or data migration is performed. Source/trace timing, mixed versions and missing measurement definition prevent treating retrospective residual associations as validated physical causes. New observation evaluation fields on this branch are additive and apply to new records only. No experimental size model is imported into the public calculation paths.
