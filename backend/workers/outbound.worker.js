import Message from "../models/message.model.js";
import { sendPigeonMessage } from "../services/pigeon.service.js";
import { takeSendToken, setCoolOff } from "../services/rateLimit.service.js";
import { publishEvent } from "../services/realtime.service.js";

// The outbox worker. Every server copy runs one.
//
// A reply is stored in MongoDB (sendState "pending") before the API answers 202.
// Workers take due messages with an atomic findOneAndUpdate that sets a lease
// (lockedUntil). If a copy dies mid-send, its lease expires and another copy (or
// the same one after a restart) picks the message up again. Pigeon sees the same
// Idempotency-Key every time, so a message that did go out is not sent twice.

const LEASE_MS = 15000; // longer than one attempt can take (send timeout is 5 s)
const POLL_MS = 400;
const CONCURRENCY = 8;
const MAX_BACKOFF_MS = 8000;

let timer = null;
let running = 0;
let ticking = false;
let stopped = true;

const backoffMs = (attempts) => {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempts);
  return base / 2 + Math.random() * (base / 2);
};

// Release the lease and schedule the next attempt. The lockedUntil filter makes sure
// we only touch the message if our lease is still the current one.
const reschedule = (message, delayMs, extra = {}) =>
  Message.updateOne(
    { _id: message._id, lockedUntil: message.lockedUntil },
    { $set: { lockedUntil: null, nextAttemptAt: new Date(Date.now() + delayMs), ...extra } }
  );

const processMessage = async (message) => {
  const wait = await takeSendToken(message.workspaceId);
  if (wait > 0) {
    // Not our turn yet; does not count as an attempt.
    await reschedule(message, wait + Math.random() * 100);
    return;
  }

  const result = await sendPigeonMessage({
    workspaceId: message.workspaceId,
    to: message.contact,
    text: message.text,
    clientRef: message.clientRef,
  });

  switch (result.outcome) {
    case "accepted":
      // Status stays as the status webhooks report it (they may already have arrived).
      await Message.updateOne(
        { _id: message._id },
        {
          $set: {
            sendState: "done",
            lockedUntil: null,
            lastError: null,
            ...(result.pigeonMessageId ? { pigeonMessageId: result.pigeonMessageId } : {}),
          },
        }
      );
      return;

    case "rate_limited":
      await setCoolOff(message.workspaceId, result.retryAfterMs);
      await reschedule(message, result.retryAfterMs + Math.random() * 250);
      return;

    case "retry":
      await reschedule(message, backoffMs(message.attempts), {
        attempts: message.attempts + 1,
        lastError: result.error,
      });
      return;

    case "rejected": {
      const failed = await Message.findOneAndUpdate(
        { _id: message._id, lockedUntil: message.lockedUntil },
        { $set: { sendState: "done", status: "failed", lockedUntil: null, lastError: result.error } },
        { returnDocument: "after" }
      ).lean();
      if (failed) {
        await publishEvent(message.workspaceId, {
          type: "message.status",
          contact: message.contact,
          client_ref: message.clientRef,
          status: "failed",
        });
      }
      return;
    }
  }
};

const claimNext = () => {
  const now = new Date();
  return Message.findOneAndUpdate(
    {
      sendState: "pending",
      nextAttemptAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + LEASE_MS) } },
    { sort: { nextAttemptAt: 1 }, returnDocument: "after" }
  ).lean();
};

const tick = async () => {
  if (ticking || stopped) return;
  ticking = true;
  try {
    while (!stopped && running < CONCURRENCY) {
      const message = await claimNext();
      if (!message) break;
      running++;
      processMessage(message)
        .catch((error) => console.error("Outbound send error:", error.message))
        .finally(() => {
          running--;
          wakeOutboundWorker();
        });
    }
  } catch (error) {
    console.error("Outbound worker error:", error.message);
  } finally {
    ticking = false;
  }
};

// Called after a reply is stored, so it goes out without waiting for the next poll.
export const wakeOutboundWorker = () => {
  if (!stopped) setImmediate(tick);
};

export const startOutboundWorker = () => {
  stopped = false;
  timer = setInterval(tick, POLL_MS);
  wakeOutboundWorker();
};

export const stopOutboundWorker = () => {
  stopped = true;
  clearInterval(timer);
};
