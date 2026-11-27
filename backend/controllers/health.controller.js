import { isDbReady } from "../config/database.js";
import { isRedisReady } from "../config/redis.js";

// 200 only when both data stores are usable; 503 otherwise.
export const healthCheck = (req, res) => {
  const mongo = isDbReady();
  const redis = isRedisReady();
  const ok = mongo && redis;

  res.status(ok ? 200 : 503).json({
    ok,
    mongo: mongo ? "up" : "down",
    redis: redis ? "up" : "down",
    uptime: process.uptime(),
  });
};
