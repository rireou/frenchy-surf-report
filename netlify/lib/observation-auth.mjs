import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "frenchy_observation_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function configuredSecret() {
  return String(process.env.BEACH_CHECK_SECRET || "");
}

function signingSecret() {
  const value = configuredSecret();
  if (value.length < 8) throw new Error("BEACH_CHECK_SECRET is not configured");
  return value;
}

function sign(value) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

export function safeEqual(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isObservationAuthConfigured() {
  return configuredSecret().length >= 8;
}

export function verifyObservationPassword(password) {
  return isObservationAuthConfigured() && safeEqual(password, configuredSecret());
}

export function createObservationSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function observationSessionCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearObservationSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isObservationAdmin(request) {
  if (!isObservationAuthConfigured()) return false;
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifySameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Error("Invalid request origin");
}
