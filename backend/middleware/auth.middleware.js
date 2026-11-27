import { getSession, SESSION_COOKIE } from "../services/session.service.js";
import { parseCookies } from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";

// Loads the session from the cookie into req.user, or answers 401.
export const requireSession = async (req, res, next) => {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const user = await getSession(sessionId);

  if (!user) throw new HttpError(401, "Not signed in");

  req.user = user;
  req.sessionId = sessionId;
  next();
};
