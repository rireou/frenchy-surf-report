import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const send = (status, body) => new Response(JSON.stringify(body), { status, headers });

function validSecret(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (request) => {
  const url = new URL(request.url);
  const spot = url.searchParams.get("spot") === "middleton" ? "middleton" : "seaford";
  const store = getStore({ name: "frenchy-beach-checks", consistency: "strong" });
  if (request.method === "GET") {
    const stored = await store.get(spot, { type: "json", consistency: "strong" });
    return send(200, stored || { active: false, spot });
  }
  if (request.method !== "POST") return send(405, { error: "Method not allowed" });
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!validSecret(provided, process.env.BEACH_CHECK_SECRET || "")) return send(401, { error: "Wrong password" });
  let input;
  try { input = await request.json(); } catch { return send(400, { error: "Invalid request" }); }
  const headline = String(input.headline || "Frenchy checked the beach").trim().slice(0, 80);
  const note = String(input.note || "").trim().slice(0, 600);
  if (!note && input.active !== false) return send(400, { error: "Write an observation first" });
  const record = { spot, active: input.active !== false, headline, note, updatedAt: new Date().toISOString() };
  await store.set(spot, JSON.stringify(record));
  return send(200, record);
};
