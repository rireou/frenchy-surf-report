(() => {
  const cleanPath = location.pathname.replace(/\/+$/, "").toLowerCase();
  const search = new URLSearchParams(location.search);
  const observationMode = cleanPath === "/observe" || cleanPath.startsWith("/observe-") || search.get("observe") === "1";
  if (!observationMode) return;

  const demoMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  const spotSlug = cleanPath.includes("middleton") || search.get("spot") === "middleton" ? "middleton" : "seaford";
  const spot = spotSlug === "middleton"
    ? { slug: "middleton", name: "Middleton", reportHref: "/middleton", observationHref: "/observe-middleton", otherName: "Seaford", otherHref: "/observe-seaford" }
    : { slug: "seaford", name: "Seaford", reportHref: "/", observationHref: "/observe-seaford", otherName: "Middleton", otherHref: "/observe-middleton" };
  const API = `/api/observations?spot=${encodeURIComponent(spot.slug)}`;
  const apiRecordUrl = id => `${API}&id=${encodeURIComponent(id)}`;
  const AUTH_API = "/api/observations/auth";
  const correctionChoices = [
    { label: "Correct", delta: 0 }, { label: "+0.5 ft", delta: 0.5 }, { label: "+1 ft", delta: 1 },
    { label: "−0.5 ft", delta: -0.5 }, { label: "−1 ft", delta: -1 }
  ];
  const sizeChoices = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];
  const conditions = [{ value: "clean", label: "✨ Clean" }, { value: "average", label: "〰 Average" }, { value: "messy", label: "💨 Messy" }];
  const state = { authenticated: false, configured: true, snapshot: null, actualFt: null, condition: "", records: [], editingId: null, clientToken: makeToken(), saved: false, deleteArmedId: null, timeOffsetMinutes: 0, customObservedAt: null, snapshotRequestId: 0 };

  document.body.classList.add("observation-mode");
  document.title = `${spot.name} Surf Observation | Frenchy`;
  const root = document.createElement("main");
  root.className = "observation-root";
  root.id = "observationRoot";
  root.innerHTML = `
    <header class="obs-header">
      <div class="obs-brand"><div class="obs-logo">≈</div><div><small>Frenchy Review</small><b>${spot.name} observation</b></div></div>
      <div class="obs-header-actions"><nav class="obs-location-switch" aria-label="Observation location"><a class="active" href="${spot.observationHref}" aria-current="page">${spot.name}</a><a href="${spot.otherHref}">${spot.otherName}</a></nav><a class="obs-link" href="${spot.reportHref}">View report</a><button class="obs-ghost obs-hidden" id="obsLogout" type="button">Log out</button></div>
    </header>
    <section class="obs-card obs-login" id="obsLogin">
      <span class="obs-eyebrow">Private access · one time only</span><h1>Ready for your beach check.</h1>
      <p>Use the same private password as the Frenchy Beach Check. This device stays securely signed in for 30 days.</p>
      <form id="obsLoginForm"><label>Password<input class="obs-input" id="obsPassword" type="password" autocomplete="current-password" required></label><button class="obs-primary" type="submit">Open observation log</button></form>
      <div class="obs-message" id="obsLoginMessage"></div>
    </section>
    <div class="obs-hidden" id="obsDashboard">
      <section class="obs-card obs-quick-card">
        <div class="obs-prediction"><div><span class="obs-eyebrow"><span class="obs-live-dot"></span>${spot.name} report for selected time</span><h1>Predicted <span id="obsPrediction">--</span> ft</h1></div><div class="obs-prediction-meta"><b id="obsForecastTime">Loading selected time...</b><br><span id="obsConditions">${spot.name}</span></div></div>
        <div class="obs-context-grid" id="obsCheckContext"><div class="obs-context-item"><small>Wind at check</small><b id="obsWindSummary">Loading wind…</b><span id="obsWindDetail">Direction and strength</span></div><div class="obs-context-item"><small>Tide position</small><b id="obsTideSummary">Loading tide…</b><span id="obsTideDetail">Height and next turn</span></div><div class="obs-context-item"><small>Tide change</small><b id="obsTideRange">Loading range…</b><span id="obsTideRangeDetail">Previous to next tide</span></div></div>
        <form id="obsForm" novalidate>
          <fieldset class="obs-fieldset"><legend>1. Choose observation time <small>defaults to now</small></legend><div class="obs-chips obs-time-chips" id="obsTimes"><button class="obs-chip selected" type="button" data-time-offset="0"><strong>Now</strong><small>current time</small></button><button class="obs-chip" type="button" data-time-offset="30"><strong>30 min</strong><small>ago</small></button><button class="obs-chip" type="button" data-time-offset="60"><strong>1 hour</strong><small>ago</small></button><button class="obs-chip" type="button" data-time-offset="120"><strong>2 hours</strong><small>ago</small></button><button class="obs-chip" type="button" data-time-custom><strong>Choose</strong><small>date & time</small></button></div><div class="obs-other obs-time-custom obs-hidden" id="obsCustomTime"><input class="obs-input" id="obsDateTime" type="datetime-local" step="60"><button class="obs-primary" type="button" id="obsUseTime">Use this time</button></div><div class="obs-selected-time-card loading" id="obsSelectedTimeCard" aria-live="polite"><span>Selected observation time</span><strong id="obsSelectedTimePrimary">Now</strong><p id="obsSelectedTime">This observation will be saved at the current time.</p><div class="obs-time-match" id="obsTimeMatch">Loading wave, wind and tide for this time...</div></div></fieldset>
          <fieldset class="obs-fieldset"><legend>Quick correction <small>fastest option</small></legend><div class="obs-chips" id="obsCorrections">${correctionChoices.map(choice => `<button class="obs-chip" type="button" data-delta="${choice.delta}"><strong>${choice.label}</strong><small data-result>--</small></button>`).join("")}</div></fieldset>
          <fieldset class="obs-fieldset"><legend>Or tap the actual size</legend><div class="obs-chips obs-size-chips" id="obsSizes">${sizeChoices.map(size => `<button class="obs-chip" type="button" data-size="${size}"><strong>${size}</strong><small>ft</small></button>`).join("")}<button class="obs-chip" type="button" data-size="other"><strong>Other</strong><small>type size</small></button></div><div class="obs-other obs-hidden" id="obsOther"><input class="obs-input" id="obsOtherSize" type="number" min="0" max="8" step="0.25" inputmode="decimal" placeholder="Actual size in feet"><button class="obs-primary" type="button" id="obsUseOther">Use</button></div></fieldset>
          <fieldset class="obs-fieldset"><legend>Wave quality <small>optional</small></legend><div class="obs-chips obs-condition-chips" id="obsQuality">${conditions.map(item => `<button class="obs-chip" type="button" data-condition="${item.value}"><strong>${item.label}</strong></button>`).join("")}</div></fieldset>
          <div class="obs-save-row"><button class="obs-primary" id="obsSave" type="submit" disabled>Loading prediction…</button><button class="obs-ghost obs-cancel obs-hidden" id="obsCancelEdit" type="button">Cancel edit</button></div>
          <div class="obs-message" id="obsSaveMessage"></div><p class="obs-help">The chosen date and time, location, forecast inputs, wind, tide, weather and calculation version are saved automatically.</p>
        </form>
      </section>
      <section class="obs-card"><div class="obs-progress"><div class="obs-count" id="obsCount">0</div><div><h2 id="obsProgressTitle">First target: 30</h2><p id="obsProgressText">Collect a range of real conditions for a useful comparison.</p><div class="obs-progress-bar"><div class="obs-progress-fill" id="obsProgressFill" style="width:0%"></div></div><div class="obs-milestones"><span data-milestone="30">30</span><span data-milestone="60">60</span><span data-milestone="100">100</span></div></div></div><div class="obs-collection"><div><small>Today</small><b id="obsTodayCount">0 / 3</b><span>up to three checks each day</span></div><div><small>Last 30 days</small><b id="obsThirtyDayCount">0 / 90</b><span>all existing data stays saved</span></div></div></section>
      <section class="obs-card"><div class="obs-section-head"><div><h2>Accuracy report</h2><p>Uses actual minus predicted size. Positive means the report underestimated.</p></div></div><div id="obsAnalysis"></div></section>
      <section class="obs-card"><div class="obs-section-head"><div><h2>${spot.name} observation history</h2><p>Edit mistakes, delete incorrect entries, or export this location.</p></div><div class="obs-export"><a class="obs-link" id="obsCsv" href="${API}&format=csv">CSV</a><a class="obs-link" id="obsJson" href="${API}&format=json">JSON</a></div></div><div class="obs-history" id="obsHistory"></div></section>
    </div>`;
  document.body.appendChild(root);

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const formatFt = value => Number(value).toFixed(Number(value) % 1 ? 1 : 0);
  const roundQuarter = value => Math.round(Number(value) * 4) / 4;

  function toDateTimeInput(value) {
    const date = new Date(value);
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function selectedObservedAt() {
    if (state.timeOffsetMinutes == null && state.customObservedAt) return state.customObservedAt;
    return new Date(Date.now() - Number(state.timeOffsetMinutes || 0) * 60000).toISOString();
  }

  function observationTimeLabel(value) {
    const date = new Date(value);
    const time = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", hour: "numeric", minute: "2-digit" }).format(date);
    const selectedDay = adelaideDateKey(date);
    const today = adelaideDateKey(new Date());
    return `${selectedDay === today ? "Today" : new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", day: "numeric", month: "short" }).format(date)} · ${time}`;
  }

  function renderSelectedTime() {
    const observedAt = selectedObservedAt();
    const label = observationTimeLabel(observedAt);
    $("obsSelectedTimePrimary").textContent = state.timeOffsetMinutes === 0 ? `Now · ${label}` : label;
    $("obsSelectedTime").textContent = `This observation will be saved for ${label}.`;
    $("obsDateTime").max = toDateTimeInput(new Date());
    $("obsDateTime").min = `${toDateTimeInput(new Date()).slice(0, 10)}T00:00`;
    document.querySelectorAll("[data-time-offset]").forEach(button => button.classList.toggle("selected", state.timeOffsetMinutes === Number(button.dataset.timeOffset)));
    document.querySelector("[data-time-custom]")?.classList.toggle("selected", state.timeOffsetMinutes == null);
  }

  function makeToken() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function setMessage(id, message = "", type = "") {
    const element = $(id);
    element.textContent = message;
    element.className = `obs-message${type ? ` ${type}` : ""}`;
  }

  function demoRecords() {
    try { return JSON.parse(localStorage.getItem(`frenchy-demo-observations-${spot.slug}`) || "[]"); } catch { return []; }
  }

  function saveDemoRecords(records) {
    localStorage.setItem(`frenchy-demo-observations-${spot.slug}`, JSON.stringify(records));
  }

  function adelaideDateKey(value) {
    const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function collectionFor(records) {
    const todayKey = adelaideDateKey(new Date());
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      todayCount: records.filter(record => adelaideDateKey(record.observedAt) === todayKey).length,
      last30DaysCount: records.filter(record => new Date(record.observedAt).getTime() >= thirtyDaysAgo).length
    };
  }

  async function request(path, options = {}) {
    if (!demoMode) {
      const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(result.error || "Request failed"); error.status = response.status; error.result = result; throw error; }
      return result;
    }
    if (path === AUTH_API && (!options.method || options.method === "GET")) return { authenticated: true, configured: true };
    if (path === AUTH_API) return { authenticated: options.method !== "DELETE", configured: true };
    let records = demoRecords();
    if (!options.method || options.method === "GET") return { observations: records, progress: progressFor(records.length), collection: collectionFor(records) };
    const input = JSON.parse(options.body || "{}");
    if (options.method === "POST") {
      const sameDay = records.filter(record => adelaideDateKey(record.observedAt) === adelaideDateKey(input.observedAt));
      if (sameDay.length >= 3) { const error = new Error(`Three ${spot.name} observations are already saved for that day. Edit one if a correction is needed.`); error.status = 409; error.result = { dailyLimit: true }; throw error; }
      const now = new Date().toISOString();
      const record = { id: makeToken(), revision: 1, schemaVersion: 3, observedAt: input.observedAt, createdAt: now, updatedAt: now, timezone: "Australia/Adelaide", location: spot.name, actualFt: input.actualFt, predictedFt: input.snapshot.predictedFt, errorFt: Number((input.actualFt - input.snapshot.predictedFt).toFixed(2)), condition: input.condition || "", note: input.note || "", calculationVersion: input.snapshot.calculationVersion, snapshot: input.snapshot };
      records.unshift(record); saveDemoRecords(records); return { observation: record };
    }
    const id = new URL(path, location.href).searchParams.get("id");
    if (options.method === "PUT") { records = records.map(record => record.id === id ? { ...record, ...input, predictedFt: input.snapshot?.predictedFt ?? record.predictedFt, calculationVersion: input.snapshot?.calculationVersion ?? record.calculationVersion, errorFt: Number((input.actualFt - (input.snapshot?.predictedFt ?? record.predictedFt)).toFixed(2)), updatedAt: new Date().toISOString(), revision: record.revision + 1 } : record); saveDemoRecords(records); return { observation: records.find(record => record.id === id) }; }
    if (options.method === "DELETE") { records = records.filter(record => record.id !== id); saveDemoRecords(records); return { deleted: true }; }
    return {};
  }

  function progressFor(count) {
    const next = [30, 60, 100].find(value => count < value) || null;
    return { count, next, remaining: next == null ? 0 : next - count, reached: [30, 60, 100].filter(value => count >= value) };
  }

  async function fetchServerSnapshot(observedAt) {
    const url = `/api/surf-reports/${encodeURIComponent(spot.slug)}.json?full=1&at=${encodeURIComponent(observedAt)}`;
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${spot.name} forecast request failed`);
    if (!payload.observation?.predictedFt && payload.observation?.predictedFt !== 0) {
      throw new Error(`No ${spot.name} forecast row matches the selected time`);
    }
    return payload.observation;
  }

  async function waitForSnapshot(observedAt = selectedObservedAt()) {
    let serverError = null;
    if (!demoMode) {
      try {
        return await fetchServerSnapshot(observedAt);
      } catch (error) {
        serverError = error;
      }
    }
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const snapshot = window.FrenchyObservation?.getSnapshotAt
        ? window.FrenchyObservation.getSnapshotAt(observedAt)
        : window.FrenchyObservation?.getCurrentSnapshot?.();
      if (snapshot?.predictedFt != null && snapshot.location === spot.name) return snapshot;
      if (demoMode && attempt === 5) return { schemaVersion: 3, calculationVersion: "local-preview", location: spot.name, calculatedAt: new Date().toISOString(), observedAt, forecastTime: toDateTimeInput(observedAt).slice(0, 13) + ":00", displayTime: `Local preview · observed ${dateTime(observedAt)}`, predictedFt: spot.slug === "middleton" ? 3 : 1.5, modelPredictedFt: spot.slug === "middleton" ? 3 : 1.5, predictedText: spot.slug === "middleton" ? "3" : "1.5", calibration: "normal", activeDriver: { heightM: 2.1, directionDeg: 232, periodS: 11.4 }, offshore: {}, local: {}, wind: { wind_speed_10m: 21, wind_direction_10m: 5 }, windContext: { speedKmh: 21, directionDeg: 5, directionCompass: "N", directionName: "north", strength: "moderate", label: "Moderate N wind · 21 km/h" }, tide: { heightM: 1.14, stage: "falling", movement: "dropping", positionLabel: "Dropping · 2 hr before low", minutesToNext: 120, minutesSincePrevious: 240, cycleProgressPct: 67, rangeM: 1.42, rangeClass: "big", rangeLabel: "Big 1.42 m tide change", source: "Preview", before: { time: "14:15", type: "High", heightM: 1.85 }, after: { time: "20:15", type: "Low", heightM: 0.43 } }, weather: { temperatureC: 16, weatherCode: 1 }, dataContext: { dataSource: "local-preview" }, calculationResult: {} };
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(serverError?.message || `The ${spot.name} forecast did not finish loading. Refresh this page and try again.`);
  }

  function showAuthenticated(authenticated) {
    state.authenticated = authenticated;
    $("obsLogin").classList.toggle("obs-hidden", authenticated);
    $("obsDashboard").classList.toggle("obs-hidden", !authenticated);
    $("obsLogout").classList.toggle("obs-hidden", !authenticated);
  }

  function selectActual(value, sourceButton = null) {
    if (!Number.isFinite(Number(value))) return;
    state.actualFt = clamp(roundQuarter(value), 0, 8);
    state.saved = false;
    $("obsSave").disabled = !state.snapshot;
    $("obsSave").textContent = state.editingId ? "Save changes" : `Save ${formatFt(state.actualFt)} ft observation`;
    document.querySelectorAll("[data-delta],[data-size]").forEach(button => button.classList.toggle("selected", button === sourceButton));
    $("obsOther").classList.add("obs-hidden");
    setMessage("obsSaveMessage");
  }

  function selectCondition(value, sourceButton = null) {
    state.condition = state.condition === value ? "" : value;
    document.querySelectorAll("[data-condition]").forEach(button => button.classList.toggle("selected", button === sourceButton && state.condition === value));
  }

  function capitalise(value) { const text = String(value || "unknown"); return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown"; }
  function clockLabel(value) { const [hourText, minute = "00"] = String(value || "").split(":"); const hour = Number(hourText); if (!Number.isFinite(hour)) return "unknown time"; const suffix = hour >= 12 ? "pm" : "am"; return `${hour % 12 || 12}:${minute} ${suffix}`; }
  function windContextFor(snapshot) {
    if (snapshot?.windContext?.label) return snapshot.windContext;
    const speedKmh = Number(snapshot?.wind?.wind_speed_10m);
    const directionDeg = Number(snapshot?.wind?.wind_direction_10m);
    const directions = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const directionCompass = Number.isFinite(directionDeg) ? directions[Math.round((((directionDeg % 360) + 360) % 360) / 22.5) % 16] : "unknown";
    const strength = !Number.isFinite(speedKmh) ? "unknown" : speedKmh < 15 ? "light" : speedKmh < 30 ? "moderate" : speedKmh < 45 ? "strong" : "stormy";
    return { speedKmh, directionDeg, directionCompass, strength, label: Number.isFinite(speedKmh) ? `${capitalise(strength)} ${directionCompass} wind · ${Math.round(speedKmh)} km/h` : "Wind unavailable" };
  }
  function tideContextFor(snapshot) {
    const tide = snapshot?.tide || {};
    const movement = tide.movement || (tide.stage === "rising" ? "pushing" : tide.stage === "falling" ? "dropping" : tide.stage || "unknown");
    const positionLabel = tide.positionLabel || capitalise(movement);
    const heightLabel = Number.isFinite(Number(tide.heightM)) ? `${Number(tide.heightM).toFixed(2)} m` : "height unavailable";
    const rangeLabel = tide.rangeLabel || (Number.isFinite(Number(tide.rangeM)) ? `${Number(tide.rangeM).toFixed(2)} m tide change` : "Tide change unavailable");
    return { ...tide, movement, positionLabel, heightLabel, rangeLabel };
  }

  function renderSnapshot() {
    if (!state.snapshot) return;
    const prediction = Number(state.snapshot.predictedFt);
    const selectedLabel = observationTimeLabel(state.snapshot.observedAt || selectedObservedAt());
    const forecastClock = String(state.snapshot.forecastTime || "").slice(11, 16);
    $("obsPrediction").textContent = formatFt(prediction);
    $("obsForecastTime").textContent = `${selectedLabel} selected${forecastClock ? ` · forecast row ${clockLabel(forecastClock)}` : ""}`;
    const swell = state.snapshot.activeDriver || {};
    $("obsConditions").textContent = `${swell.heightM?.toFixed?.(1) || "--"} m · ${Math.round(swell.directionDeg || 0)}° · ${swell.periodS?.toFixed?.(1) || "--"} s`;
    const wind = windContextFor(state.snapshot);
    const tide = tideContextFor(state.snapshot);
    $("obsWindSummary").textContent = wind.label;
    $("obsWindDetail").textContent = Number.isFinite(Number(wind.directionDeg)) ? `${capitalise(wind.directionName || wind.directionCompass)} · ${Math.round(wind.directionDeg)}°` : "Direction unavailable";
    $("obsTideSummary").textContent = `${tide.positionLabel} · ${tide.heightLabel}`;
    $("obsTideDetail").textContent = tide.after?.type ? `Next ${String(tide.after.type).toLowerCase()} ${clockLabel(tide.after.time)} · ${Math.round(tide.cycleProgressPct || 0)}% through this tide` : "Next tide unavailable";
    $("obsTideRange").textContent = tide.rangeLabel;
    $("obsTideRangeDetail").textContent = tide.before?.heightM != null && tide.after?.heightM != null ? `${Number(tide.before.heightM).toFixed(2)} m ${String(tide.before.type).toLowerCase()} → ${Number(tide.after.heightM).toFixed(2)} m ${String(tide.after.type).toLowerCase()}` : "Range unavailable";
    $("obsSelectedTimeCard").classList.remove("loading", "error");
    $("obsSelectedTimeCard").classList.add("ready");
    $("obsTimeMatch").textContent = `✓ Matched ${spot.name} data: ${formatFt(prediction)} ft · ${wind.label} · ${tide.positionLabel}`;
    document.querySelectorAll("[data-delta]").forEach(button => {
      const result = clamp(roundQuarter(prediction + Number(button.dataset.delta)), 0, 8);
      button.querySelector("[data-result]").textContent = `${formatFt(result)} ft`;
    });
    selectActual(prediction, document.querySelector('[data-delta="0"]'));
  }

  async function refreshSnapshotForTime(revealSelection = false) {
    const observedAt = selectedObservedAt();
    const requestId = ++state.snapshotRequestId;
    state.saved = false;
    state.clientToken = makeToken();
    state.snapshot = null;
    state.actualFt = null;
    renderSelectedTime();
    if (revealSelection) $("obsSelectedTimeCard").scrollIntoView?.({ behavior: "smooth", block: "center" });
    $("obsSelectedTimeCard").classList.remove("ready", "error");
    $("obsSelectedTimeCard").classList.add("loading");
    $("obsTimeMatch").textContent = `Loading wave, wind and tide for ${observationTimeLabel(observedAt)}...`;
    $("obsPrediction").textContent = "--";
    $("obsForecastTime").textContent = `Loading ${spot.name} data for ${observationTimeLabel(observedAt)}...`;
    $("obsSave").disabled = true;
    $("obsSave").textContent = "Loading selected time...";
    document.querySelectorAll("[data-delta],[data-size]").forEach(button => button.classList.remove("selected"));
    setMessage("obsSaveMessage", "Matching the report to the selected observation time...");
    try {
      const snapshot = await waitForSnapshot(observedAt);
      if (requestId !== state.snapshotRequestId) return;
      state.snapshot = snapshot;
      renderSnapshot();
      setMessage("obsSaveMessage");
    } catch (error) {
      if (requestId !== state.snapshotRequestId) return;
      state.snapshot = null;
      $("obsSave").disabled = true;
      $("obsSave").textContent = "Prediction unavailable";
      $("obsSelectedTimeCard").classList.remove("loading", "ready");
      $("obsSelectedTimeCard").classList.add("error");
      $("obsTimeMatch").textContent = `Could not load ${spot.name} data for ${observationTimeLabel(observedAt)}.`;
      setMessage("obsSaveMessage", error.message, "error");
    }
  }

  function chooseQuickTime(minutes) {
    state.timeOffsetMinutes = Number(minutes);
    state.customObservedAt = null;
    $("obsCustomTime").classList.add("obs-hidden");
    refreshSnapshotForTime(true);
  }

  function showCustomTime() {
    $("obsCustomTime").classList.remove("obs-hidden");
    $("obsDateTime").value = toDateTimeInput(selectedObservedAt());
    $("obsDateTime").max = toDateTimeInput(new Date());
    $("obsDateTime").focus();
  }

  function useCustomTime() {
    const selected = new Date($("obsDateTime").value);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!Number.isFinite(selected.getTime()) || selected > now || selected < startOfToday) {
      setMessage("obsSaveMessage", "Choose a time from today that is not in the future.", "error");
      return;
    }
    state.timeOffsetMinutes = null;
    state.customObservedAt = selected.toISOString();
    $("obsCustomTime").classList.add("obs-hidden");
    refreshSnapshotForTime(true);
  }

  async function loadRecords() {
    const result = await request(API);
    state.records = result.observations || [];
    renderProgress(); renderAnalysis(); renderHistory();
  }

  function renderProgress() {
    const progress = progressFor(state.records.length);
    $("obsCount").textContent = progress.count;
    const base = progress.next || 100;
    const previous = progress.next === 60 ? 30 : progress.next === 100 ? 60 : progress.next == null ? 100 : 0;
    const percentage = progress.next == null ? 100 : ((progress.count - previous) / (base - previous)) * 100;
    $("obsProgressFill").style.width = `${clamp(percentage, 0, 100)}%`;
    document.querySelectorAll("[data-milestone]").forEach(element => element.classList.toggle("reached", progress.count >= Number(element.dataset.milestone)));
    const collection = collectionFor(state.records);
    $("obsTodayCount").textContent = `${collection.todayCount} / 3`;
    $("obsThirtyDayCount").textContent = `${collection.last30DaysCount} / 90`;
    if (progress.next) {
      $("obsProgressTitle").textContent = `Next accuracy report: ${progress.next} observations`;
      $("obsProgressText").textContent = `${progress.remaining} more to reach the next confidence milestone.`;
    } else {
      $("obsProgressTitle").textContent = "100-observation calibration set reached";
      $("obsProgressText").textContent = `This is a strong base for testing ${spot.name} formula changes.`;
    }
  }

  function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
  function directionBand(value) { const degree = Number(value); if (!Number.isFinite(degree)) return "Unknown"; if (spot.slug === "middleton") { if (degree < 160) return "East edge <160°"; if (degree <= 185) return "160–185° S"; if (degree <= 210) return "186–210° SSW"; if (degree <= 230) return "211–230° SW"; if (degree <= 245) return "231–245° WSW"; return "Outside South Coast band"; } if (degree < 215) return "South edge <215°"; if (degree <= 225) return "215–225°"; if (degree <= 235) return "226–235°"; if (degree <= 245) return "236–245°"; if (degree <= 260) return "246–260°"; return "Outside Mid Coast band"; }
  function periodBand(value) { const period = Number(value); if (!Number.isFinite(period)) return "Unknown"; if (period < 9) return "Under 9 s"; if (period < 11) return "9–11 s"; if (period < 14) return "11–14 s"; return "14 s+"; }
  function windBand(record) { const wind = windContextFor(record.snapshot); if (!Number.isFinite(Number(wind.speedKmh))) return "Unknown"; return `${capitalise(wind.strength)} ${wind.directionCompass || "unknown"}`; }
  function groupStats(records, label, getter) {
    const groups = new Map();
    records.forEach(record => { const key = getter(record) || "Unknown"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record); });
    return [...groups.entries()].map(([name, rows]) => { const errors = rows.map(row => Number(row.errorFt)); return { category: label, name, count: rows.length, bias: mean(errors), mae: mean(errors.map(Math.abs)) }; }).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
  }

  function breakdownHtml(title, groups) {
    const useful = groups.filter(group => group.count >= 3).slice(0, 5);
    return `<div class="obs-analysis-block"><h3>${escapeHtml(title)}</h3>${useful.length ? useful.map(group => `<div class="obs-breakdown-row"><div><b>${escapeHtml(group.name)}</b><small>${group.count} checks · MAE ${group.mae.toFixed(2)} ft</small></div><b class="obs-bias ${group.bias >= 0 ? "under" : "over"}">${group.bias >= 0 ? "+" : ""}${group.bias.toFixed(2)} ft</b></div>`).join("") : `<small>Need at least 3 observations in the same condition.</small>`}</div>`;
  }

  function renderAnalysis() {
    const container = $("obsAnalysis");
    const count = state.records.length;
    if (count < 30) {
      container.innerHTML = `<div class="obs-locked"><b>${30 - count} more observations before the first full report</b><p>Early results are deliberately held back so a few unusual days do not lead us to change the calculation too soon.</p></div>`;
      return;
    }
    const errors = state.records.map(record => Number(record.errorFt));
    const mae = mean(errors.map(Math.abs));
    const bias = mean(errors);
    const exact = errors.filter(error => Math.abs(error) <= 0.25).length / count * 100;
    const withinHalf = errors.filter(error => Math.abs(error) <= 0.5).length / count * 100;
    const direction = groupStats(state.records, "swell direction", record => directionBand(record.snapshot?.activeDriver?.directionDeg));
    const period = groupStats(state.records, "swell period", record => periodBand(record.snapshot?.activeDriver?.periodS));
    const tide = groupStats(state.records, "tide movement", record => capitalise(tideContextFor(record.snapshot).movement));
    const tideRange = groupStats(state.records, "tide range", record => capitalise(tideContextFor(record.snapshot).rangeClass));
    const wind = groupStats(state.records, "wind", windBand);
    const allGroups = [...direction, ...period, ...tide, ...tideRange, ...wind].filter(group => group.count >= 4 && Math.abs(group.bias) >= 0.3).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
    const suggestions = allGroups.slice(0, 4).map(group => `${group.bias > 0 ? "The report tends to underestimate" : "The report tends to overestimate"} by ${Math.abs(group.bias).toFixed(2)} ft during ${group.name.toLowerCase()} ${group.category} conditions (${group.count} observations). Test a ${group.bias > 0 ? "small increase" : "small reduction"} for this band against the full saved dataset before publishing.`);
    const milestone = count >= 100 ? 100 : count >= 60 ? 60 : 30;
    container.innerHTML = `<span class="obs-eyebrow">${milestone}-observation report · ${count} total</span><div class="obs-analysis-summary"><div class="obs-metric"><small>Mean error</small><b>${mae.toFixed(2)} ft</b></div><div class="obs-metric"><small>Average bias</small><b>${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ft</b></div><div class="obs-metric"><small>Exact ±0.25</small><b>${Math.round(exact)}%</b></div><div class="obs-metric"><small>Within ±0.5</small><b>${Math.round(withinHalf)}%</b></div></div><div class="obs-analysis-grid">${breakdownHtml("Swell direction", direction)}${breakdownHtml("Swell period", period)}${breakdownHtml("Tide movement", tide)}${breakdownHtml("Tide range", tideRange)}${breakdownHtml("Wind conditions", wind)}</div><h3 style="margin-top:18px">Suggested calibration checks</h3>${suggestions.length ? `<ul class="obs-suggestions">${suggestions.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : `<p>No condition group has a large enough repeated bias yet. Keep collecting a wider spread of conditions.</p>`}`;
  }

  function dateTime(value) { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
  function renderHistory() {
    const container = $("obsHistory");
    if (!state.records.length) { container.innerHTML = `<div class="obs-empty">No observations yet. Your first beach check will appear here.</div>`; return; }
    container.innerHTML = state.records.map(record => {
      const errorClass = record.errorFt > 0.1 ? "under" : record.errorFt < -0.1 ? "over" : "";
      const errorText = Math.abs(record.errorFt) <= 0.1 ? "Correct" : `${record.errorFt > 0 ? "+" : ""}${Number(record.errorFt).toFixed(1)} ft`;
      const armed = state.deleteArmedId === record.id;
      const wind = windContextFor(record.snapshot);
      const tide = tideContextFor(record.snapshot);
      const tideHeight = Number.isFinite(Number(tide.heightM)) ? `${Number(tide.heightM).toFixed(2)} m` : "height unavailable";
      return `<article class="obs-record" data-record="${escapeHtml(record.id)}"><div class="obs-record-size ${errorClass}">${escapeHtml(errorText)}</div><div><b>Actual ${formatFt(record.actualFt)} ft · predicted ${formatFt(record.predictedFt)} ft</b><small>${escapeHtml(dateTime(record.observedAt))}${record.condition ? ` · ${escapeHtml(record.condition)}` : ""} · ${escapeHtml(record.calculationVersion)}</small><small class="obs-record-context">${escapeHtml(wind.label)} · ${escapeHtml(tide.positionLabel)} · ${escapeHtml(tideHeight)} · ${escapeHtml(tide.rangeLabel)}</small></div><div class="obs-record-actions"><button type="button" data-edit="${escapeHtml(record.id)}">Edit</button><button type="button" data-delete="${escapeHtml(record.id)}" class="${armed ? "delete-armed" : ""}">${armed ? "Tap again to delete" : "Delete"}</button></div></article>`;
    }).join("");
  }

  function startEdit(id) {
    const record = state.records.find(item => item.id === id);
    if (!record) return;
    state.editingId = id; state.condition = record.condition || ""; state.saved = false;
    state.timeOffsetMinutes = null; state.customObservedAt = record.observedAt; state.snapshot = record.snapshot;
    renderSelectedTime();
    $("obsDateTime").value = toDateTimeInput(record.observedAt);
    renderSnapshot();
    selectActual(record.actualFt);
    document.querySelectorAll("[data-condition]").forEach(button => button.classList.toggle("selected", button.dataset.condition === state.condition));
    $("obsCancelEdit").classList.remove("obs-hidden");
    $("obsSave").textContent = "Save changes";
    setMessage("obsSaveMessage", `Editing observation from ${dateTime(record.observedAt)}`);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    state.editingId = null; state.condition = ""; state.clientToken = makeToken();
    state.timeOffsetMinutes = 0; state.customObservedAt = null;
    $("obsCancelEdit").classList.add("obs-hidden");
    $("obsCustomTime").classList.add("obs-hidden");
    document.querySelectorAll("[data-condition]").forEach(button => button.classList.remove("selected"));
    renderSelectedTime();
    loadLiveSnapshot();
  }

  async function deleteObservation(id) {
    if (state.deleteArmedId !== id) {
      state.deleteArmedId = id; renderHistory();
      setTimeout(() => { if (state.deleteArmedId === id) { state.deleteArmedId = null; renderHistory(); } }, 5000);
      return;
    }
    try {
      await request(apiRecordUrl(id), { method: "DELETE" });
      state.records = state.records.filter(record => record.id !== id); state.deleteArmedId = null;
      renderProgress(); renderAnalysis(); renderHistory();
    } catch (error) { setMessage("obsSaveMessage", error.message, "error"); }
  }

  async function saveObservation(event) {
    event.preventDefault();
    if (!state.snapshot || state.actualFt == null || state.saved) return;
    const button = $("obsSave"); button.disabled = true; button.textContent = state.editingId ? "Saving changes…" : "Saving observation…";
    try {
      if (state.editingId) {
        const result = await request(apiRecordUrl(state.editingId), { method: "PUT", body: JSON.stringify({ actualFt: state.actualFt, condition: state.condition, observedAt: state.snapshot.observedAt || selectedObservedAt(), snapshot: state.snapshot }) });
        state.records = state.records.map(record => record.id === state.editingId ? result.observation : record);
        setMessage("obsSaveMessage", "Observation updated.", "success"); cancelEdit();
      } else {
        const result = await request(API, { method: "POST", body: JSON.stringify({ actualFt: state.actualFt, condition: state.condition, observedAt: state.snapshot.observedAt || selectedObservedAt(), clientToken: state.clientToken, snapshot: state.snapshot }) });
        if (!state.records.some(record => record.id === result.observation.id)) state.records.unshift(result.observation);
        state.saved = true;
        button.textContent = result.deduplicated ? "Already saved ✓" : "Saved ✓";
        setMessage("obsSaveMessage", result.deduplicated ? "This observation was already saved—no duplicate was created." : "Saved with the full forecast snapshot.", "success");
      }
      renderProgress(); renderAnalysis(); renderHistory();
    } catch (error) {
      if (error.status === 409 && error.result?.observation) {
        state.saved = true; button.textContent = "Already saved ✓"; setMessage("obsSaveMessage", error.message, "success");
      } else {
        button.disabled = false; button.textContent = state.editingId ? "Save changes" : `Save ${formatFt(state.actualFt)} ft observation`; setMessage("obsSaveMessage", error.message, "error");
      }
    }
  }

  async function login(event) {
    event.preventDefault(); setMessage("obsLoginMessage", "Checking…");
    try {
      await request(AUTH_API, { method: "POST", body: JSON.stringify({ password: $("obsPassword").value }) });
      $("obsPassword").value = ""; showAuthenticated(true); await Promise.all([loadRecords(), loadLiveSnapshot()]);
    } catch (error) { setMessage("obsLoginMessage", error.message, "error"); }
  }

  async function logout() {
    await request(AUTH_API, { method: "DELETE", body: "{}" }).catch(() => {}); showAuthenticated(false);
  }

  async function loadLiveSnapshot() {
    await refreshSnapshotForTime();
  }

  function bindEvents() {
    $("obsLoginForm").addEventListener("submit", login);
    $("obsLogout").addEventListener("click", logout);
    $("obsForm").addEventListener("submit", saveObservation);
    $("obsCancelEdit").addEventListener("click", cancelEdit);
    $("obsTimes").addEventListener("click", event => { const quick = event.target.closest("[data-time-offset]"); const custom = event.target.closest("[data-time-custom]"); if (quick) chooseQuickTime(quick.dataset.timeOffset); if (custom) showCustomTime(); });
    $("obsUseTime").addEventListener("click", useCustomTime);
    $("obsDateTime").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); useCustomTime(); } });
    $("obsCorrections").addEventListener("click", event => { const button = event.target.closest("[data-delta]"); if (button && state.snapshot) selectActual(Number(state.snapshot.predictedFt) + Number(button.dataset.delta), button); });
    $("obsSizes").addEventListener("click", event => { const button = event.target.closest("[data-size]"); if (!button) return; if (button.dataset.size === "other") { $("obsOther").classList.remove("obs-hidden"); $("obsOtherSize").focus(); return; } selectActual(Number(button.dataset.size), button); });
    $("obsUseOther").addEventListener("click", () => selectActual(Number($("obsOtherSize").value)));
    $("obsOtherSize").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); selectActual(Number(event.currentTarget.value)); } });
    $("obsQuality").addEventListener("click", event => { const button = event.target.closest("[data-condition]"); if (button) selectCondition(button.dataset.condition, button); });
    $("obsHistory").addEventListener("click", event => { const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]"); if (edit) startEdit(edit.dataset.edit); if (remove) deleteObservation(remove.dataset.delete); });
    if (demoMode) {
      $("obsCsv").addEventListener("click", event => { event.preventDefault(); downloadDemo("csv"); });
      $("obsJson").addEventListener("click", event => { event.preventDefault(); downloadDemo("json"); });
    }
  }

  function downloadDemo(format) {
    const content = format === "json" ? JSON.stringify({ observations: state.records }, null, 2) : "id,observed_at,actual_ft,predicted_ft,error_ft\n" + state.records.map(record => [record.id, record.observedAt, record.actualFt, record.predictedFt, record.errorFt].join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv" })); link.download = `${spot.slug}-observations.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function init() {
    bindEvents();
    try {
      const auth = await request(AUTH_API);
      state.configured = auth.configured !== false; showAuthenticated(Boolean(auth.authenticated));
      if (!state.configured) setMessage("obsLoginMessage", "Add BEACH_CHECK_SECRET in Netlify before using observations.", "error");
      if (auth.authenticated) await Promise.all([loadRecords(), loadLiveSnapshot()]);
    } catch (error) { setMessage("obsLoginMessage", error.message, "error"); showAuthenticated(false); }
  }

  init();
})();
