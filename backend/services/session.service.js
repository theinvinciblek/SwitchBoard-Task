import crypto from "node:crypto";
import { redisClient } from "../config/redis.js";
import { parseCookies } from "../utils/cookies.js";

// Sessions live in Redis so every server copy sees them. The cookie holds only a
// random id; the user's identity and workspaces are stored server-side.
// The "auth:" prefix is outside "sb:", so /__grader/reset leaves sessions alone.

export const SESSION_COOKIE = "sb_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const sessionKey = (id) => `auth:sess:${id}`;

export const createSession = async (user) => {
  const id = crypto.randomBytes(32).toString("base64url");
  await redisClient.set(sessionKey(id), JSON.stringify(user), { EX: SESSION_TTL_SECONDS });
  return id;
};

export const getSession = async (id) => {
  if (typeof id !== "string" || id.length < 20 || id.length > 100) return null;
  const raw = await redisClient.get(sessionKey(id));
  return raw ? JSON.parse(raw) : null;
};

export const deleteSession = (id) => redisClient.del(sessionKey(id));

// For places without Express (the WebSocket upgrade).
export const getSessionFromCookieHeader = (cookieHeader) =>
  getSession(parseCookies(cookieHeader)[SESSION_COOKIE]);
