# Seaford period sensitivity — offline only

Run from the repository root with a private evidence directory and a **new** run ID:

    node research/period/experiment.mjs ../frenchy-research-private period-new-run

The runner verifies and consults every private Research Memory event before running. It refuses to overwrite an existing evidence JSON. Populated results and the interactive HTML are written outside this public repository; do not upload them as GitHub assets. The loopback private preview serves the reviewed initial result at `/research/period`.

The controlled grid compares 9 s and 14 s primary offshore swell while holding offshore height/direction, wind, local/Gulf inputs, valid times and tide tables fixed in each pair. Three in-memory variants retain every other rule: the current additive period bonus, a bounded continuous bonus and no additive bonus. Driver-ranking period factors are retained, not multiplied into beach height a second time. Results include several same-day tide contexts. These scenarios test model behavior, not observed accuracy.

Historical comparisons use only the original saved observations/predictions. Alternative bonuses are arithmetic sensitivities, **not full downstream counterfactual replays**. The runner reports check/day-weighted errors, day-bootstrap uncertainty, development and previously inspected evaluation partitions, improvements, regressions and newly excessive over/undercalls. No fitting or current-weather refetch occurs. The original target did not distinguish typical waves from occasional sets. Sparse long-period days cannot establish a causal period correction. Retain the public baseline pending independent evidence; none of these variants is promoted.

Physical interpretation: period affects propagation, shoaling, refraction and exposure, while local bathymetry and sheltering also control breaking height. A universal monotonic uplift is not established for Seaford. See [NOAA coastal transformation discussion](https://repository.library.noaa.gov/view/noaa/34729/noaa_34729_DS1.pdf) and [National Weather Service wave detail](https://www.weather.gov/marine/wavedetail). These sources explain mechanisms; they do not validate this site's empirical coefficients. H²T is not used as a direct height multiplier.

No public forecast source, calibration, Model D artifact, collector schedule or retention policy changes in this experiment.
