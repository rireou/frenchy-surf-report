(() => {
  const observationMode = location.pathname.replace(/\/+$/, "") === "/observe" || new URLSearchParams(location.search).get("observe") === "1";
  if (!observationMode) return;

  const demoMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = "/api/observations";
  const AUTH_API = "/api/observations/auth";
  const correctionChoices = [
    { label: "Correct", delta: 0 }, { label: "+0.5 ft", delta: 0.5 }, { label: "+1 ft", delta: 1 },
    { label: "−0.5 ft", delta: -0.5 }, { label: "−1 ft", delta: -1 }
  ];
  const sizeChoices = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];
  const conditions = [{ value: "clean", label: "✨ Clean" }, { value: "average", label: "〰 Average" }, { value: "messy", label: "💨 Messy" }];
  const state = { authenticated: false, configured: true, snapshot: null, actualFt: null, condition: "", records: [], editingId: null, clientToken: makeToken(), saved: false, deleteArmedId: null };

  document.body.classList.add("observation-mode");
  document.title = "Seaford Surf Observation | Frenchy";
  const root = document.createElement("main");
  root.className = "observation-root";
  root.id = "observationRoot";
  root.innerHTML = `
    <header class="obs-header">
      <div class="obs-brand"><div class="obs-logo">≈</div><div><small>Frenchy Review</small><b>Seaford observation</b></div></div>
      <div class="obs-header-actions"><a class="obs-link" href="/">View report</a><button class="obs-ghost obs-hidden" id="obsLogout" type="button">Log out</button></div>
    </header>
    <section class="obs-card obs-login" id="obsLogin">
      <span class="obs-eyebrow">Private access · one time only</span><h1>Ready for your beach check.</h1>
      <p>Use the same private password as the Frenchy Beach Check. This device stays securely signed in for 30 days.</p>
      <form id="obsLoginForm"><label>Password<input class="obs-input" id="obsPassword" type="password" autocomplete="current-password" required></label><button class="obs-primary" type="submit">Open observation log</button></form>
      <div class="obs-message" id="obsLoginMessage"></div>
    </section>
    <div class="obs-hidden" id="obsDashboard">
      <section class="obs-card obs-quick-card">
        <div class="obs-prediction"><div><span class="obs-eyebrow"><span class="obs-live-dot"></span>Current report</span><h1>Predicted <span id="obsPrediction">--</span> ft</h1></div><div class="obs-prediction-meta"><b id="obsForecastTime">Loading live conditions…</b><br><span id="obsConditions">Seaford</span></div></div>
        <form id="obsForm">
          <fieldset class="obs-fieldset"><legend>Quick correction <small>fastest option</small></legend><div class="obs-chips" id="obsCorrections">${correctionChoices.map(choice => `<button class="obs-chip" type="button" data-delta="${choice.delta}"><strong>${choice.label}</strong><small data-result>--</small></button>`).join("")}</div></fieldset>
          <fieldset class="obs-fieldset"><legend>Or tap the actual size</legend><div class="obs-chips obs-size-chips" id="obsSizes">${sizeChoices.map(size => `<button class="obs-chip" type="button" data-size="${size}"><strong>${size}</strong><small>ft</small></button>`).join("")}<button class="obs-chip" type="button" data-size="other"><strong>Other</strong><small>type size</small></button></div><div class="obs-other obs-hidden" id="obsOther"><input class="obs-input" id="obsOtherSize" type="number" min="0" max="8" step="0.25" inputmode="decimal" placeholder="Actual size in feet"><button class="obs-primary" type="button" id="obsUseOther">Use</button></div></fieldset>
          <fieldset class="obs-fieldset"><legend>Wave quality <small>optional</small></legend><div class="obs-chips obs-condition-chips" id="obsQuality">${conditions.map(item => `<button class="obs-chip" type="button" data-condition="${item.value}"><strong>${item.label}</strong></button>`).join("")}</div></fieldset>
          <div class="obs-save-row"><button class="obs-primary" id="obsSave" type="submit" disabled>Loading prediction…</button><button class="obs-ghost obs-cancel obs-hidden" id="obsCancelEdit" type="button">Cancel edit</button></div>
          <div class="obs-message" id="obsSaveMessage"></div><p class="obs-help">Date, exact time, location, forecast inputs, wind, tide, weather and calculation version are saved automatically.</p>
        </form>
      </section>
      <section class="obs-card"><div class="obs-progress"><div class="obs-count" id="obsCount">0</div><div><h2 id="obsProgressTitle">First target: 30</h2><p id="obsProgressText">Collect a range of real conditions for a useful comparison.</p><div class="obs-progress-bar"><div class="obs-progress-fill" id="obsProgressFill" style="width:0%"></div></div><div class="obs-milestones"><span data-milestone="30">30</span><span data-milestone="60">60</span><span data-milestone="100">100</span></div></div></div></section>
      <section class="obs-card"><div class="obs-section-head"><div><h2>Accuracy report</h2><p>Uses actual minus predicted size. Positive means the report underestimated.</p></div></div><div id="obsAnalysis"></div></section>
      <section class="obs-card"><div class="obs-section-head"><div><h2>Observation history</h2><p>Edit mistakes, delete incorrect entries, or export everything.</p></div><div class="obs-export"><a class="obs-link" id="obsCsv" href="${API}?format=csv">CSV</a><a class="obs-link" id="obsJson" href="${API}?format=json">JSON</a></div></div><div class="obs-history" id="obsHistory"></div></section>
    </div>`;
  document.body.appendChild(root);

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const formatFt = value => Number(value).toFixed(Number(value) % 1 ? 1 : 0);
  const roundQuarter = value => Math.round(Number(value) * 4) / 4;

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
    try { return JSON.parse(localStorage.getItem("frenchy-demo-observations") || "[]"); } catch { return []; }
  }

  function saveDemoRecords(records) {
    localStorage.setItem("frenchy-demo-observations", JSON.stringify(records));
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
    if (!options.method || options.method === "GET") return { observations: records, progress: progressFor(records.length) };
    const input = JSON.parse(options.body || "{}");
    if (options.method === "POST") {
      const record = { id: makeToken(), revision: 1, schemaVersion: 1, observedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), timezone: "Australia/Adelaide", location: "Seaford", actualFt: input.actualFt, predictedFt: input.snapshot.predictedFt, errorFt: Number((input.actualFt - input.snapshot.predictedFt).toFixed(2)), condition: input.condition || "", note: input.note || "", calculationVersion: input.snapshot.calculationVersion, snapshot: input.snapshot };
      records.unshift(record); saveDemoRecords(records); return { observation: record };
    }
    const id = new URL(path, location.href).searchParams.get("id");
    if (options.method === "PUT") { records = records.map(record => record.id === id ? { ...record, ...input, errorFt: Number((input.actualFt - record.predictedFt).toFixed(2)), updatedAt: new Date().toISOString(), revision: record.revision + 1 } : record); saveDemoRecords(records); return { observation: records.find(record => record.id === id) }; }
    if (options.method === "DELETE") { records = records.filter(record => record.id !== id); saveDemoRecords(records); return { deleted: true }; }
    return {};
  }

  function progressFor(count) {
    const next = [30, 60, 100].find(value => count < value) || null;
    return { count, next, remaining: next == null ? 0 : next - count, reached: [30, 60, 100].filter(value => count >= value) };
  }

  async function waitForSnapshot() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const snapshot = window.FrenchyObservation?.getCurrentSnapshot?.();
      if (snapshot?.predictedFt != null) return snapshot;
      if (demoMode && attempt === 5) return { schemaVersion: 1, calculationVersion: "local-preview", location: "Seaford", calculatedAt: new Date().toISOString(), forecastTime: new Date().toISOString().slice(0, 13) + ":00", displayTime: "Local preview · current hour", predictedFt: 1.5, modelPredictedFt: 1.5, predictedText: "1.5", calibration: "normal", activeDriver: { heightM: 2.1, directionDeg: 232, periodS: 11.4 }, offshore: {}, local: {}, wind: { wind_speed_10m: 9, wind_direction_10m: 70 }, tide: { heightM: 1.2, stage: "rising", source: "Preview" }, weather: { temperatureC: 16, weatherCode: 1 }, dataContext: { dataSource: "local-preview" }, calculationResult: {} };
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("The live forecast did not finish loading. Tap View report, refresh it, then try again.");
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

  function renderSnapshot() {
    if (!state.snapshot) return;
    const prediction = Number(state.snapshot.predictedFt);
    $("obsPrediction").textContent = formatFt(prediction);
    $("obsForecastTime").textContent = state.snapshot.displayTime || "Current forecast";
    const swell = state.snapshot.activeDriver || {};
    $("obsConditions").textContent = `${swell.heightM?.toFixed?.(1) || "--"} m · ${Math.round(swell.directionDeg || 0)}° · ${swell.periodS?.toFixed?.(1) || "--"} s`;
    document.querySelectorAll("[data-delta]").forEach(button => {
      const result = clamp(roundQuarter(prediction + Number(button.dataset.delta)), 0, 8);
      button.querySelector("[data-result]").textContent = `${formatFt(result)} ft`;
    });
    selectActual(prediction, document.querySelector('[data-delta="0"]'));
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
    if (progress.next) {
      $("obsProgressTitle").textContent = `Next accuracy report: ${progress.next} observations`;
      $("obsProgressText").textContent = `${progress.remaining} more to reach the next confidence milestone.`;
    } else {
      $("obsProgressTitle").textContent = "100-observation calibration set reached";
      $("obsProgressText").textContent = "This is a strong base for testing Seaford formula changes.";
    }
  }

  function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
  function directionBand(value) { const degree = Number(value); if (!Number.isFinite(degree)) return "Unknown"; if (degree < 215) return "South edge <215°"; if (degree <= 225) return "215–225°"; if (degree <= 235) return "226–235°"; if (degree <= 245) return "236–245°"; if (degree <= 260) return "246–260°"; return "Outside Mid Coast band"; }
  function periodBand(value) { const period = Number(value); if (!Number.isFinite(period)) return "Unknown"; if (period < 9) return "Under 9 s"; if (period < 11) return "9–11 s"; if (period < 14) return "11–14 s"; return "14 s+"; }
  function windBand(record) { const speed = Number(record.snapshot?.wind?.wind_speed_10m); const direction = Number(record.snapshot?.wind?.wind_direction_10m); if (!Number.isFinite(speed)) return "Unknown"; const strength = speed < 15 ? "Light" : speed < 30 ? "Moderate" : "Strong"; if (speed < 15 || !Number.isFinite(direction)) return strength; const sector = direction >= 315 || direction < 45 ? "N" : direction < 135 ? "E" : direction < 225 ? "S" : "W"; return `${strength} ${sector}`; }
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
    const tide = groupStats(state.records, "tide stage", record => record.snapshot?.tide?.stage || "Unknown");
    const wind = groupStats(state.records, "wind", windBand);
    const allGroups = [...direction, ...period, ...tide, ...wind].filter(group => group.count >= 4 && Math.abs(group.bias) >= 0.3).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
    const suggestions = allGroups.slice(0, 4).map(group => `${group.bias > 0 ? "The report tends to underestimate" : "The report tends to overestimate"} by ${Math.abs(group.bias).toFixed(2)} ft during ${group.name.toLowerCase()} ${group.category} conditions (${group.count} observations). Test a ${group.bias > 0 ? "small increase" : "small reduction"} for this band against the full saved dataset before publishing.`);
    const milestone = count >= 100 ? 100 : count >= 60 ? 60 : 30;
    container.innerHTML = `<span class="obs-eyebrow">${milestone}-observation report · ${count} total</span><div class="obs-analysis-summary"><div class="obs-metric"><small>Mean error</small><b>${mae.toFixed(2)} ft</b></div><div class="obs-metric"><small>Average bias</small><b>${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ft</b></div><div class="obs-metric"><small>Exact ±0.25</small><b>${Math.round(exact)}%</b></div><div class="obs-metric"><small>Within ±0.5</small><b>${Math.round(withinHalf)}%</b></div></div><div class="obs-analysis-grid">${breakdownHtml("Swell direction", direction)}${breakdownHtml("Swell period", period)}${breakdownHtml("Tide stage", tide)}${breakdownHtml("Wind conditions", wind)}</div><h3 style="margin-top:18px">Suggested calibration checks</h3>${suggestions.length ? `<ul class="obs-suggestions">${suggestions.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : `<p>No condition group has a large enough repeated bias yet. Keep collecting a wider spread of conditions.</p>`}`;
  }

  function dateTime(value) { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
  function renderHistory() {
    const container = $("obsHistory");
    if (!state.records.length) { container.innerHTML = `<div class="obs-empty">No observations yet. Your first beach check will appear here.</div>`; return; }
    container.innerHTML = state.records.map(record => {
      const errorClass = record.errorFt > 0.1 ? "under" : record.errorFt < -0.1 ? "over" : "";
      const errorText = Math.abs(record.errorFt) <= 0.1 ? "Correct" : `${record.errorFt > 0 ? "+" : ""}${Number(record.errorFt).toFixed(1)} ft`;
      const armed = state.deleteArmedId === record.id;
      return `<article class="obs-record" data-record="${escapeHtml(record.id)}"><div class="obs-record-size ${errorClass}">${escapeHtml(errorText)}</div><div><b>Actual ${formatFt(record.actualFt)} ft · predicted ${formatFt(record.predictedFt)} ft</b><small>${escapeHtml(dateTime(record.observedAt))}${record.condition ? ` · ${escapeHtml(record.condition)}` : ""} · ${escapeHtml(record.calculationVersion)}</small></div><div class="obs-record-actions"><button type="button" data-edit="${escapeHtml(record.id)}">Edit</button><button type="button" data-delete="${escapeHtml(record.id)}" class="${armed ? "delete-armed" : ""}">${armed ? "Tap again to delete" : "Delete"}</button></div></article>`;
    }).join("");
  }

  function startEdit(id) {
    const record = state.records.find(item => item.id === id);
    if (!record) return;
    state.editingId = id; state.condition = record.condition || ""; state.saved = false;
    selectActual(record.actualFt);
    document.querySelectorAll("[data-condition]").forEach(button => button.classList.toggle("selected", button.dataset.condition === state.condition));
    $("obsCancelEdit").classList.remove("obs-hidden");
    $("obsSave").textContent = "Save changes";
    setMessage("obsSaveMessage", `Editing observation from ${dateTime(record.observedAt)}`);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    state.editingId = null; state.condition = ""; state.clientToken = makeToken();
    $("obsCancelEdit").classList.add("obs-hidden");
    document.querySelectorAll("[data-condition]").forEach(button => button.classList.remove("selected"));
    if (state.snapshot) selectActual(state.snapshot.predictedFt, document.querySelector('[data-delta="0"]'));
  }

  async function deleteObservation(id) {
    if (state.deleteArmedId !== id) {
      state.deleteArmedId = id; renderHistory();
      setTimeout(() => { if (state.deleteArmedId === id) { state.deleteArmedId = null; renderHistory(); } }, 5000);
      return;
    }
    try {
      await request(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
        const result = await request(`${API}?id=${encodeURIComponent(state.editingId)}`, { method: "PUT", body: JSON.stringify({ actualFt: state.actualFt, condition: state.condition }) });
        state.records = state.records.map(record => record.id === state.editingId ? result.observation : record);
        setMessage("obsSaveMessage", "Observation updated.", "success"); cancelEdit();
      } else {
        const result = await request(API, { method: "POST", body: JSON.stringify({ actualFt: state.actualFt, condition: state.condition, clientToken: state.clientToken, snapshot: state.snapshot }) });
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
    try { state.snapshot = await waitForSnapshot(); renderSnapshot(); } catch (error) { setMessage("obsSaveMessage", error.message, "error"); $("obsSave").textContent = "Prediction unavailable"; }
  }

  function bindEvents() {
    $("obsLoginForm").addEventListener("submit", login);
    $("obsLogout").addEventListener("click", logout);
    $("obsForm").addEventListener("submit", saveObservation);
    $("obsCancelEdit").addEventListener("click", cancelEdit);
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
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv" })); link.download = `seaford-observations.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
