import { redisClient } from "../config/redis.js";

// Real-time events, shared by every server copy through Redis.
//
// Each workspace has a seq counter, a log of recent frames (sorted set, score = seq)
// and one pub/sub channel for all copies. One Lua script increments the counter,
// appends to the log and publishes, and Redis runs scripts atomically, so frames
// are published in seq order and every subscriber sees them in that order.

export const EVENTS_CHANNEL = "sb:events";
const LOG_SIZE = 5000;

// The seq counter is deliberately outside the "sb:" prefix that reset deletes:
// seq must only go up within a workspace, even across a reset.
const seqKey = (workspaceId) => `rt:seq:${workspaceId}`;
const logKey = (workspaceId) => `sb:events:${workspaceId}`;

const PUBLISH_SCRIPT = `
local seq = redis.call('INCR', KEYS[1])
local frame = '{"seq":' .. seq .. ',' .. string.sub(ARGV[1], 2)
redis.call('ZADD', KEYS[2], seq, frame)
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -(tonumber(ARGV[3]) + 1))
redis.call('PUBLISH', ARGV[2], '{"workspaceId":' .. ARGV[4] .. ',"frame":' .. frame .. '}')
return seq
`;

// Publishes { type, ...fields } to a workspace and returns its seq.
// Real-time is best effort: a Redis failure is logged, never thrown, so it cannot
// fail the request that changed the data.
export const publishEvent = async (workspaceId, event) => {
  try {
    const body = JSON.stringify(event);
    if (body === "{}") throw new Error("empty event");
    return await redisClient.eval(PUBLISH_SCRIPT, {
      keys: [seqKey(workspaceId), logKey(workspaceId)],
      arguments: [body, EVENTS_CHANNEL, String(LOG_SIZE), JSON.stringify(workspaceId)],
    });
  } catch (error) {
    console.error("Realtime publish failed:", error.message);
    return null;
  }
};

// Frames with seq > after, oldest first, as parsed objects.
export const getEventsAfter = async (workspaceId, after) => {
  const frames = await redisClient.zRangeByScore(logKey(workspaceId), `(${after}`, "+inf");
  return frames.map((frame) => JSON.parse(frame));
};

export const getLatestSeq = async (workspaceId) => Number(await redisClient.get(seqKey(workspaceId))) || 0;

let subscriber = null;

// Calls onEvent(workspaceId, frame) for every event published by any copy.
export const startEventSubscriber = async (onEvent) => {
  subscriber = redisClient.duplicate();
  subscriber.on("error", (err) => console.error("Redis subscriber error:", err.message));
  await subscriber.connect();
  await subscriber.subscribe(EVENTS_CHANNEL, (message) => {
    try {
      const { workspaceId, frame } = JSON.parse(message);
      onEvent(workspaceId, frame);
    } catch (error) {
      console.error("Bad realtime message:", error.message);
    }
  });
};

export const stopEventSubscriber = async () => {
  if (subscriber?.isOpen) await subscriber.quit();
  subscriber = null;
};
