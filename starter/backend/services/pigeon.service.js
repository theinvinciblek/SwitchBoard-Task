import env from "../config/env.js";

// Pigeon sometimes accepts a message but answers after 12 s. We give up long before
// that; the retry carries the same Idempotency-Key, so Pigeon replays its original
// answer instead of sending again.
const SEND_TIMEOUT_MS = 5000;

// Returns one of:
//   { outcome: "accepted", pigeonMessageId }
//   { outcome: "rate_limited", retryAfterMs }
//   { outcome: "retry", error }      (5xx, timeout, network: safe to try again)
//   { outcome: "rejected", error }   (4xx other than 429: trying again will not help)
export const sendPigeonMessage = async ({ workspaceId, to, text, clientRef }) => {
  const apiKey = env.pigeonKeys[workspaceId];
  if (!apiKey) return { outcome: "rejected", error: `No Pigeon API key for ${workspaceId}` };

  let res;
  try {
    res = await fetch(`${env.pigeonUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "idempotency-key": clientRef,
      },
      body: JSON.stringify({ to, text, client_ref: clientRef }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    return { outcome: "retry", error: error.name === "TimeoutError" ? "timeout" : error.message };
  }

  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    return { outcome: "accepted", pigeonMessageId: body.id || null };
  }

  await res.body?.cancel().catch(() => {});

  if (res.status === 429) {
    const seconds = Number(res.headers.get("retry-after"));
    return { outcome: "rate_limited", retryAfterMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 2) * 1000 };
  }

  if (res.status >= 500) return { outcome: "retry", error: `HTTP ${res.status}` };

  return { outcome: "rejected", error: `HTTP ${res.status}` };
};
