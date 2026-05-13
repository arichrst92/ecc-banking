import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type SessionRole = "global" | "branch";

export interface Session {
  role: SessionRole;
  branchId?: number;
  iat: number;
  exp: number;
}

const COOKIE_NAME = "ecc_session";
const TTL_DAYS = 7;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set (≥32 chars). Generate: openssl rand -hex 32");
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  return Buffer.from(s + "=".repeat(pad), "base64");
}
function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSession(role: SessionRole, branchId?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const session: Session = { role, branchId, iat: now, exp: now + TTL_DAYS * 86400 };
  const payload = b64url(Buffer.from(JSON.stringify(session)));
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let session: Session;
  try {
    session = JSON.parse(b64urlDecode(payload).toString("utf8"));
  } catch {
    return null;
  }
  if (!session.role || !session.exp) return null;
  if (session.exp < Math.floor(Date.now() / 1000)) return null;
  return session;
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 86400,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export function getSession(): Session | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  return verifySession(token);
}

export function requireSession(): Session {
  const s = getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

export function requireGlobal(): Session {
  const s = requireSession();
  if (s.role !== "global") throw new Error("FORBIDDEN");
  return s;
}
