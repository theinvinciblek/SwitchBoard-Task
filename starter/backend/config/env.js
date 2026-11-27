import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the .env file from the project root (one level above /backend).
// Variables already set in the environment (e.g. PORT from the check harness) win.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const required = ["MONGO_URL", "REDIS_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// PIGEON_KEY_WS_ACME=pk_... -> { ws_acme: "pk_..." }. These define which workspaces exist.
const PIGEON_KEY_PREFIX = "PIGEON_KEY_";
const pigeonKeys = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key, value]) => key.startsWith(PIGEON_KEY_PREFIX) && value)
    .map(([key, value]) => [key.slice(PIGEON_KEY_PREFIX.length).toLowerCase(), value])
);

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  mongoUrl: process.env.MONGO_URL,
  redisUrl: process.env.REDIS_URL,
  // No default on purpose: without GRADER_TOKEN every /__grader request gets 401.
  graderToken: process.env.GRADER_TOKEN || null,
  pigeonKeys,
  pigeonUrl: process.env.PIGEON_URL || "http://localhost:4010",
  oidc: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    redirectUri: process.env.OIDC_REDIRECT_URI,
  },
};

export default env;
