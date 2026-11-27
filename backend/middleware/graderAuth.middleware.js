import crypto from "node:crypto";
import env from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

// Hashing first gives equal-length buffers, so timingSafeEqual works for any input.
const safeEqual = (a, b) => {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

// Protects /__grader/* : header x-grader-token must equal GRADER_TOKEN, otherwise 401.
export const requireGraderToken = (req, res, next) => {
  const given = req.get("x-grader-token");

  if (!env.graderToken || typeof given !== "string" || !safeEqual(given, env.graderToken)) {
    throw new HttpError(401, "Invalid or missing grader token");
  }

  next();
};
