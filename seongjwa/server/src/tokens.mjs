// 접근 토큰(HS256 JWT)과 리프레시 토큰. Worker가 직접 서명·검증한다(요청마다 DB 조회 없음, 전작 검토 B5).
const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const keyCache = new Map();
async function hmacKey(secret) {
  if (!secret || secret.length < 32) throw new Error("token_secret_invalid");
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keyCache.get(secret);
}

export async function signAccess(secret, claims, ttlSeconds, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${header}.${body}`)));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyAccess(secret, token, now = Date.now()) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) throw new Error("auth_invalid");
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  } catch (error) {
    if (error.message === "token_secret_invalid") throw error;
  }
  if (!ok) throw new Error("auth_invalid");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  if (header.alg !== "HS256") throw new Error("auth_invalid");
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new Error("auth_expired");
  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") throw new Error("auth_invalid");
  return claims;
}

export function newRefreshToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
