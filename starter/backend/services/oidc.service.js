import crypto from "node:crypto";
import env from "../config/env.js";
import { redisClient } from "../config/redis.js";
import { HttpError } from "../utils/httpError.js";

// OpenID Connect, authorization code flow with PKCE (S256), against env.oidc.issuer.
// No library: discovery, token exchange and RS256 id_token verification with node:crypto.

const LOGIN_TTL_SECONDS = 600;
const ROLES = new Set(["admin", "agent"]);
const loginKey = (state) => `auth:login:${state}`;
const random = () => crypto.randomBytes(32).toString("base64url");

let discoveryPromise = null;
let jwksCache = { keys: [], fetchedAt: 0 };

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(502, `Identity provider error (${res.status}): ${body?.error ?? "unknown"}`);
  return body;
};

const getDiscovery = () => {
  discoveryPromise ??= fetchJson(`${env.oidc.issuer}/.well-known/openid-configuration`).catch((error) => {
    discoveryPromise = null; // try again next time
    throw error;
  });
  return discoveryPromise;
};

const getSigningKey = async (kid) => {
  const find = () => jwksCache.keys.find((key) => key.kid === kid);
  // Refetch when the kid is unknown (the IdP rotated keys or restarted), at most every 10 s.
  if (!find() && Date.now() - jwksCache.fetchedAt > 10000) {
    const { jwks_uri: jwksUri } = await getDiscovery();
    jwksCache = { keys: (await fetchJson(jwksUri)).keys ?? [], fetchedAt: Date.now() };
  }
  const jwk = find();
  if (!jwk) throw new HttpError(401, "id_token signed with an unknown key");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
};

const verifyIdToken = async (idToken, expectedNonce) => {
  const parts = typeof idToken === "string" ? idToken.split(".") : [];
  if (parts.length !== 3) throw new HttpError(401, "Malformed id_token");

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new HttpError(401, "Unexpected id_token algorithm");

  const key = await getSigningKey(header.kid);
  const valid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) throw new HttpError(401, "Invalid id_token signature");

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== env.oidc.issuer) throw new HttpError(401, "Wrong id_token issuer");
  if (!audiences.includes(env.oidc.clientId)) throw new HttpError(401, "Wrong id_token audience");
  if (typeof claims.exp !== "number" || claims.exp < now - 30) throw new HttpError(401, "Expired id_token");
  if (claims.nonce !== expectedNonce) throw new HttpError(401, "id_token nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new HttpError(401, "id_token has no sub");

  return claims;
};

// Step 1: returns the IdP URL to redirect to, and the state to bind to the browser.
export const beginLogin = async () => {
  const { authorization_endpoint: authorizationEndpoint } = await getDiscovery();
  const state = random();
  const nonce = random();
  const verifier = random();
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  // Stored in Redis so the callback can land on any server copy.
  await redisClient.set(loginKey(state), JSON.stringify({ nonce, verifier }), { EX: LOGIN_TTL_SECONDS });

  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.oidc.clientId,
    redirect_uri: env.oidc.redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  return { url: url.toString(), state };
};

// Step 2: exchanges the code and returns the user to store in the session.
export const completeLogin = async ({ code, state }) => {
  if (typeof code !== "string" || typeof state !== "string") throw new HttpError(400, "Missing code or state");

  // getDel: a state can be used once.
  const saved = await redisClient.getDel(loginKey(state));
  if (!saved) throw new HttpError(400, "Login expired or already used; start again");
  const { nonce, verifier } = JSON.parse(saved);

  const { token_endpoint: tokenEndpoint } = await getDiscovery();
  const tokens = await fetchJson(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.oidc.redirectUri,
      client_id: env.oidc.clientId,
      client_secret: env.oidc.clientSecret,
      code_verifier: verifier,
    }),
  });

  const claims = await verifyIdToken(tokens.id_token, nonce);

  const workspaces = (Array.isArray(claims.workspaces) ? claims.workspaces : [])
    .filter((w) => w && typeof w.id === "string" && ROLES.has(w.role))
    .map((w) => ({ id: w.id, role: w.role }));

  return {
    sub: claims.sub,
    name: typeof claims.name === "string" ? claims.name : null,
    email: typeof claims.email === "string" ? claims.email : null,
    workspaces,
  };
};
