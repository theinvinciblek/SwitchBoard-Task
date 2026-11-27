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

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  mongoUrl: process.env.MONGO_URL,
  redisUrl: process.env.REDIS_URL,
};

export default env;
