import env from "../config/env.js";
import { beginLogin, completeLogin } from "../services/oidc.service.js";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../services/session.service.js";
import { parseCookies } from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";

const LOGIN_COOKIE = "sb_login";

// Secure cookies only when the app is served over https; the dev setup is plain http.
const secure = env.oidc.redirectUri?.startsWith("https://") ?? false;
const cookieOptions = { httpOnly: true, sameSite: "lax", secure, path: "/" };

// GET /auth/login
export const login = async (req, res) => {
  const { url, state } = await beginLogin();

  // Binds the login to this browser: the callback must come back with the same state.
  res.cookie(LOGIN_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  res.redirect(302, url);
};

// GET /auth/callback?code=&state=
export const callback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) throw new HttpError(400, `Login refused by the identity provider: ${error}`);

  if (typeof state !== "string" || parseCookies(req.headers.cookie)[LOGIN_COOKIE] !== state) {
    throw new HttpError(400, "Login state does not match this browser; start again");
  }

  const user = await completeLogin({ code, state });

  // Always a new session id, so a session cannot be fixed in advance.
  const sessionId = await createSession(user);

  res.clearCookie(LOGIN_COOKIE, cookieOptions);
  res.cookie(SESSION_COOKIE, sessionId, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
  res.redirect(302, env.webOrigin);
};

// POST /auth/logout
export const logout = async (req, res) => {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (sessionId) await deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
};

// GET /api/me
export const me = (req, res) => {
  const { sub, name, email, workspaces } = req.user;
  res.status(200).json({ sub, name, email, workspaces });
};
