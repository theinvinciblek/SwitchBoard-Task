import { createClient } from "redis";
import env from "./env.js";

let hasConnected = false;
// node-redis wraps socket failures (e.g. ReconnectStrategyError -> socketError -> AggregateError),
// so dig for the first non-empty message.
const errorText = (err) => {
  if (!err) return "unknown error";
  if (err.message) return err.message;
  const inner = err.socketError || err.originalError || err.errors?.[0];
  return inner ? errorText(inner) : err.code || err.name || String(err);
};

// Shared client: import { redisClient } wherever you need Redis.
export const redisClient = createClient({
  url: env.redisUrl,
  socket: {
    // On startup, give up after 5 retries so the server fails fast.
    // After the first successful connect, keep retrying with backoff.
    reconnectStrategy: (retries, cause) => {
      if (!hasConnected && retries >= 5) return cause || new Error("Redis unreachable");
      return Math.min(retries * 200, 3000);
    },
  },
});

// Without an error listener, a Redis error would crash the process.
redisClient.on("error", (err) => {
  if (hasConnected) console.error("Redis error:", errorText(err));
});
redisClient.on("ready", () => {
  hasConnected = true;
});
redisClient.on("reconnecting", () => {
  if (hasConnected) console.warn("Redis reconnecting...");
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    await redisClient.ping();
    console.log("Redis connected");
  } catch (error) {
    console.error(`Redis connection failed (${env.redisUrl}):`, errorText(error));
    throw error;
  }
};

export const disconnectRedis = async () => {
  if (redisClient.isOpen) await redisClient.quit();
};

export const isRedisReady = () => redisClient.isReady;

export default redisClient;
