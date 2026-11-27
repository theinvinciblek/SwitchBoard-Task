import { redisClient } from "../config/redis.js";

// Per-workspace send limit, shared by every server copy through Redis.
//
// Pigeon allows a bucket of 8 that refills at 4/s per workspace. Our bucket is a
// little smaller and slower, so we stay under Pigeon's limit instead of finding it
// with 429s. If Pigeon still answers 429, setCoolOff() blocks the whole workspace
// (all copies) until its Retry-After has passed, because requests sent inside that
// window are penalised.
const CAPACITY = 6;
const RATE_PER_SECOND = 3.5;

const bucketKey = (workspaceId) => `sb:rl:${workspaceId}`;
const coolOffKey = (workspaceId) => `sb:cool:${workspaceId}`;

// Returns 0 if a send may start now, otherwise the milliseconds to wait.
const TAKE_SCRIPT = `
local cool = redis.call('PTTL', KEYS[2])
if cool > 0 then return cool end
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = tonumber(state[1]) or capacity
local at = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + (now - at) / 1000 * rate)
local wait = 0
if tokens < 1 then
  wait = math.ceil((1 - tokens) / rate * 1000)
else
  tokens = tokens - 1
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'at', tostring(now))
redis.call('PEXPIRE', KEYS[1], 60000)
return wait
`;

export const takeSendToken = async (workspaceId) =>
  Number(
    await redisClient.eval(TAKE_SCRIPT, {
      keys: [bucketKey(workspaceId), coolOffKey(workspaceId)],
      arguments: [String(CAPACITY), String(RATE_PER_SECOND)],
    })
  );

// Only ever extends a cool-off, never shortens one set by another copy.
export const setCoolOff = async (workspaceId, ms) => {
  const key = coolOffKey(workspaceId);
  const current = await redisClient.pTTL(key);
  if (current < ms) await redisClient.set(key, "1", { PX: ms });
};
