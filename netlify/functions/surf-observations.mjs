import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { isObservationAdmin, verifySameOrigin } from "../lib/observation-auth.mjs";

const STORE_NAME = "frenchy-surf-observations";
const SCHEMA_VERSION = 1;
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const send = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extraHeaders } });
const store = () => getStore({ name: STORE_NAME, consistency: "strong" });

function finiteNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cleanText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanJson(value, depth = 0) {
  if (depth > 8 || value == null) return value == null ? null : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 80).map(item => cleanJson(item, depth + 1)).filter(item => item !== undefined);
  if (typeof value !== "object") return undefined;
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 220)) {
    const key = String(rawKey).slice(0, 100);
    if (["__proto__", "prototype", "constructor"].includes(key)) continue;
    const cleaned = cleanJson(rawValue, depth + 1);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

async function listObservations() {
  const listing = await store().list({ prefix: "observations/" });
  const records = await Promise.all((listing.blobs || []).slice(0, 1000).map(entry => store().get(entry.key, { type: "json", consistency: "strong" })));
  return records.filter(Boolean).sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)));
}

function milestoneProgress(count) {
  const milestones = [30, 60, 100];
  const reached = milestones.filter(value => count >= value);
  const next = milestones.find(value => count < value) || null;
  return { count, reached, next, remaining: next == null ? 0 : next - count };
}

function csvCell(value) {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvExport(records) {
  const columns = [
    ["id", record => record.id], ["observed_at_utc", record => record.observedAt], ["timezone", record => record.timezone],
    ["location", record => record.location], ["actual_ft", record => record.actualFt], ["predicted_ft", record => record.predictedFt],
    ["error_ft_actual_minus_predicted", record => record.errorFt], ["condition", record => record.condition], ["note", record => record.note],
    ["calculation_version", record => record.calculationVersion], ["forecast_time", record => record.snapshot?.forecastTime],
    ["swell_height_m", record => record.snapshot?.activeDriver?.heightM], ["swell_direction_deg", record => record.snapshot?.activeDriver?.directionDeg],
    ["swell_period_s", record => record.snapshot?.activeDriver?.periodS], ["wind_speed_kmh", record => record.snapshot?.wind?.wind_speed_10m],
    ["wind_direction_deg", record => record.snapshot?.wind?.wind_direction_10m], ["tide_height_m", record => record.snapshot?.tide?.heightM],
    ["tide_stage", record => record.snapshot?.tide?.stage], ["weather_code", record => record.snapshot?.weather?.weatherCode],
    ["temperature_c", record => record.snapshot?.weather?.temperatureC], ["calculation_snapshot_json", record => record.snapshot]
  ];
  return [columns.map(([name]) => csvCell(name)).join(","), ...records.map(record => columns.map(([, getter]) => csvCell(getter(record))).join(","))].join("\r\n");
}

function validateCreate(input) {
  const actualFt = finiteNumber(input.actualFt, 0, 8);
  const predictedFt = finiteNumber(input.snapshot?.predictedFt, 0, 8);
  if (actualFt == null) throw new Error("Choose the actual wave size");
  if (predictedFt == null) throw new Error("The current prediction is unavailable. Refresh and try again.");
  const condition = ["clean", "average", "messy", ""].includes(input.condition) ? input.condition : "";
  const clientToken = cleanText(input.clientToken, 100).replace(/[^a-zA-Z0-9_-]/g, "");
  if (clientToken.length < 8) throw new Error("Invalid save token. Refresh and try again.");
  const snapshot = cleanJson(input.snapshot);
  const calculationVersion = cleanText(snapshot?.calculationVersion || "unknown", 100);
  return { actualFt, predictedFt, condition, note: cleanText(input.note, 300), clientToken, snapshot, calculationVersion };
}

function validateUpdate(input) {
  const actualFt = finiteNumber(input.actualFt, 0, 8);
  if (actualFt == null) throw new Error("Choose the actual wave size");
  const condition = ["clean", "average", "messy", ""].includes(input.condition) ? input.condition : "";
  return { actualFt, condition, note: cleanText(input.note, 300) };
}

export default async (request) => {
  if (!isObservationAdmin(request)) return send(401, { error: "Please log in to the observation page." });
  const url = new URL(request.url);

  if (request.method === "GET") {
    const records = await listObservations();
    const format = url.searchParams.get("format");
    if (format === "csv") {
      return new Response(csvExport(records), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="seaford-surf-observations-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    }
    if (format === "json") {
      return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, observations: records }, null, 2), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="seaford-surf-observations-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
    }
    return send(200, { observations: records, progress: milestoneProgress(records.length) });
  }

  try { verifySameOrigin(request); } catch { return send(403, { error: "Forbidden" }); }
  const raw = await request.text();
  if (raw.length > 100000) return send(413, { error: "Observation is too large" });
  let input;
  try { input = JSON.parse(raw || "{}"); } catch { return send(400, { error: "Invalid request" }); }

  if (request.method === "POST") {
    let validated;
    try { validated = validateCreate(input); } catch (error) { return send(400, { error: error.message }); }

    const priorId = await store().get(`idempotency/${validated.clientToken}`, { type: "text", consistency: "strong" });
    if (priorId) {
      const prior = await store().get(`observations/${priorId}`, { type: "json", consistency: "strong" });
      if (prior) return send(200, { observation: prior, deduplicated: true });
    }

    const existing = await listObservations();
    const duplicate = existing.find(record =>
      Date.now() - new Date(record.observedAt).getTime() < DUPLICATE_WINDOW_MS &&
      Number(record.actualFt) === validated.actualFt && Number(record.predictedFt) === validated.predictedFt
    );
    if (duplicate) return send(409, { error: "That observation was already saved a moment ago.", duplicate: true, observation: duplicate });

    const now = new Date().toISOString();
    const id = randomUUID();
    const record = {
      id, schemaVersion: SCHEMA_VERSION, revision: 1, observedAt: now, updatedAt: now,
      timezone: "Australia/Adelaide", location: "Seaford", actualFt: validated.actualFt,
      predictedFt: validated.predictedFt, errorFt: Number((validated.actualFt - validated.predictedFt).toFixed(2)),
      condition: validated.condition, note: validated.note, calculationVersion: validated.calculationVersion,
      snapshot: validated.snapshot
    };
    await store().setJSON(`observations/${id}`, record);
    await store().set(`idempotency/${validated.clientToken}`, id);
    return send(201, { observation: record });
  }

  const id = cleanText(url.searchParams.get("id"), 80).replace(/[^a-zA-Z0-9-]/g, "");
  if (!id) return send(400, { error: "Observation ID is required" });
  const current = await store().get(`observations/${id}`, { type: "json", consistency: "strong" });
  if (!current) return send(404, { error: "Observation not found" });

  if (request.method === "PUT") {
    let validated;
    try { validated = validateUpdate(input); } catch (error) { return send(400, { error: error.message }); }
    const updated = {
      ...current, ...validated, updatedAt: new Date().toISOString(), revision: Number(current.revision || 1) + 1,
      errorFt: Number((validated.actualFt - Number(current.predictedFt)).toFixed(2))
    };
    await store().setJSON(`observations/${id}`, updated);
    return send(200, { observation: updated });
  }

  if (request.method === "DELETE") {
    await store().delete(`observations/${id}`);
    return send(200, { deleted: true, id });
  }

  return send(405, { error: "Method not allowed" });
};

export const config = { path: "/api/observations" };
