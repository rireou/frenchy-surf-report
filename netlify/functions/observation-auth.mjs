import {
  clearObservationSessionCookie,
  createObservationSession,
  isObservationAdmin,
  isObservationAuthConfigured,
  observationSessionCookie,
  verifyObservationPassword,
  verifySameOrigin
} from "../lib/observation-auth.mjs";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const send = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });

export default async (request) => {
  if (request.method === "GET") {
    return send(200, { authenticated: isObservationAdmin(request), configured: isObservationAuthConfigured() });
  }

  try { verifySameOrigin(request); } catch { return send(403, { error: "Forbidden" }); }

  if (request.method === "DELETE") {
    return send(200, { authenticated: false }, { "Set-Cookie": clearObservationSessionCookie() });
  }

  if (request.method !== "POST") return send(405, { error: "Method not allowed" });
  if (!isObservationAuthConfigured()) return send(503, { error: "The observation password has not been configured in Netlify yet." });

  const input = await request.json().catch(() => ({}));
  if (!verifyObservationPassword(String(input.password || ""))) return send(401, { error: "Wrong password" });

  return send(200, { authenticated: true }, { "Set-Cookie": observationSessionCookie(createObservationSession()) });
};

export const config = { path: "/api/observations/auth" };
