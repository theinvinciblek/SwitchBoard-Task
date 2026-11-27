import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Tests for the pieces most likely to be wrong: webhook idempotency and ordering,
// status monotonicity, reply idempotency, and tenant checks on the API.
const SECRET = "whsec_test";
process.env.MONGO_URL = process.env.TEST_MONGO_URL || "mongodb://localhost:27017/switchboard_test_webhooks";
process.env.GRADER_TOKEN = "test-grader-token";
process.env.PIGEON_WEBHOOK_SECRET = SECRET;
process.env.PIGEON_KEY_WS_ACME ||= "pk_test_acme";
process.env.PIGEON_KEY_WS_GLOBEX ||= "pk_test_globex";

const { default: mongoose } = await import("mongoose");
const { default: app } = await import("../app.js");
const { connectDb, disconnectDb, ensureIndexes } = await import("../config/database.js");
const { connectRedis, disconnectRedis } = await import("../config/redis.js");
const { syncWorkspacesFromEnv } = await import("../services/workspace.service.js");
const { default: Message } = await import("../models/message.model.js");
const { default: Conversation } = await import("../models/conversation.model.js");
const { default: WebhookEvent } = await import("../models/webhook.model.js");
const { createSession, SESSION_COOKIE } = await import("../services/session.service.js");

let server;
let baseUrl;
let seq = 0;

const sign = (body, secondsAgo = 0, secret = SECRET) => {
  const t = Math.floor(Date.now() / 1000) - secondsAgo;
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
};

const webhook = async (event, { secondsAgo = 0, secret = SECRET, raw } = {}) => {
  const body = raw ?? JSON.stringify(event);
  const res = await fetch(`${baseUrl}/webhooks/pigeon`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pigeon-signature": sign(body, secondsAgo, secret) },
    body,
  });
  return res.status;
};

const inbound = (workspace, from, occurredAt, messageId = `pmsg_${++seq}`) => ({
  id: `evt_${++seq}`,
  type: "message.inbound",
  workspace,
  occurred_at: new Date(occurredAt).toISOString(),
  data: { message_id: messageId, from, text: `hi ${messageId}` },
});

const status = (clientRef, value) => ({
  id: `evt_${++seq}`,
  type: "message.status",
  workspace: "ws_acme",
  occurred_at: new Date().toISOString(),
  data: { message_id: `pm_${clientRef}`, client_ref: clientRef, status: value },
});

const grader = (path, body) =>
  fetch(`${baseUrl}/__grader/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-grader-token": "test-grader-token" },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  await connectRedis();
  await connectDb();
  await mongoose.connection.dropDatabase();
  await ensureIndexes();
  await syncWorkspacesFromEnv();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.connection.dropDatabase();
  await disconnectDb();
  await disconnectRedis();
});

beforeEach(async () => {
  await Promise.all([Message.deleteMany({}), Conversation.deleteMany({}), WebhookEvent.deleteMany({})]);
});

describe("Pigeon webhook: answers PIGEON.md requires", () => {
  it("401 for a wrong signature, 401 for a stale timestamp, 200 for 4 minutes old", async () => {
    assert.equal(await webhook(inbound("ws_acme", "+1", Date.now()), { secret: "wrong" }), 401);
    assert.equal(await webhook(inbound("ws_acme", "+1", Date.now()), { secondsAgo: 3600 }), 401);
    assert.equal(await webhook(inbound("ws_acme", "+1", Date.now()), { secondsAgo: 240 }), 200);
  });

  it("400 for an unparseable body or a bad occurred_at, never 5xx", async () => {
    assert.equal(await webhook(null, { raw: "{not json" }), 400);
    assert.equal(await webhook({ ...inbound("ws_acme", "+1", Date.now()), occurred_at: "yesterday" }), 400);
  });

  it("2xx and ignored: unknown event type, unknown workspace, status for a message never sent", async () => {
    assert.equal(await webhook({ id: "evt_x", type: "contact.updated", workspace: "ws_acme" }), 200);
    assert.equal(await webhook(inbound("ws_unknown", "+1", Date.now())), 200);
    assert.equal(await webhook(status("never-sent", "delivered")), 200);
    assert.equal(await Message.countDocuments(), 0);
  });
});

describe("Pigeon webhook: inbound", () => {
  it("stores a duplicated event once", async () => {
    const event = inbound("ws_acme", "+14155550101", Date.now());
    const results = await Promise.all([webhook(event), webhook(event), webhook(event)]);
    assert.deepEqual(results, [200, 200, 200]);
    assert.equal(await Message.countDocuments(), 1);
  });

  it("reprocesses an event that was recorded but never finished (crash between steps)", async () => {
    const event = inbound("ws_acme", "+14155550101", Date.now());
    // Simulates a process killed after recording the event, before saving the message.
    await WebhookEvent.create({
      eventId: event.id, workspaceId: "ws_acme", eventType: event.type,
      occurredAt: new Date(event.occurred_at), payload: event, processed: false,
    });
    assert.equal(await webhook(event), 200);
    assert.equal(await Message.countDocuments({ pigeonMessageId: event.data.message_id }), 1);
  });

  it("creates one conversation when a new contact's first messages arrive at once", async () => {
    const now = Date.now();
    const events = Array.from({ length: 8 }, (_, i) => inbound("ws_acme", "+14155550109", now + i));
    await Promise.all(events.map((e) => webhook(e)));
    assert.equal(await Conversation.countDocuments({ contact: "+14155550109" }), 1);
    assert.equal(await Message.countDocuments(), 8);
  });

  it("orders by occurred_at, not arrival, and lastMessageAt never moves backwards", async () => {
    const t = Date.now();
    const newer = inbound("ws_acme", "+14155550101", t + 5000, "pmsg_newer");
    const older = inbound("ws_acme", "+14155550101", t, "pmsg_older");
    await webhook(newer);
    await webhook(older);

    const snap = await (await grader("snapshot")).json();
    assert.deepEqual(snap.workspaces.ws_acme.contacts["+14155550101"].inbound, ["pmsg_older", "pmsg_newer"]);
    const conversation = await Conversation.findOne({ contact: "+14155550101" });
    assert.equal(conversation.lastMessageAt.getTime(), t + 5000);
    assert.equal(conversation.lastMessageText, "hi pmsg_newer");
  });

  it("keeps the same contact in two workspaces apart", async () => {
    await webhook(inbound("ws_acme", "+14155550101", Date.now(), "pmsg_a"));
    await webhook(inbound("ws_globex", "+14155550101", Date.now(), "pmsg_g"));
    const snap = await (await grader("snapshot")).json();
    assert.deepEqual(snap.workspaces.ws_acme.contacts["+14155550101"].inbound, ["pmsg_a"]);
    assert.deepEqual(snap.workspaces.ws_globex.contacts["+14155550101"].inbound, ["pmsg_g"]);
  });
});

describe("Replies and statuses", () => {
  const reply = (clientRef) =>
    grader("reply", { workspace: "ws_acme", contact: "+14155550101", text: "hello", client_ref: clientRef });

  it("the same client_ref at the same instant is one reply, and both get 202", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => reply("ref-1")));
    assert.deepEqual(results.map((r) => r.status), [202, 202, 202, 202, 202]);
    assert.equal(await Message.countDocuments({ clientRef: "ref-1" }), 1);
  });

  it("is stored in the outbox as pending before the 202", async () => {
    await reply("ref-2");
    const message = await Message.findOne({ clientRef: "ref-2" }).lean();
    assert.equal(message.direction, "outbound");
    assert.equal(message.contact, "+14155550101");
    assert.ok(message.sendState === "pending" || message.sendState === "done");
  });

  it("rejects bad input with 400 and an unknown workspace with 404", async () => {
    assert.equal((await grader("reply", { workspace: "ws_acme", contact: "+1", text: "", client_ref: "r" })).status, 400);
    assert.equal((await grader("reply", { workspace: "ws_nope", contact: "+1", text: "x", client_ref: "r" })).status, 404);
  });

  it("status only moves forward: a late 'sent' does not undo 'delivered' or 'failed'", async () => {
    await reply("ref-d");
    await reply("ref-f");
    await webhook(status("ref-d", "delivered"));
    await webhook(status("ref-d", "sent"));
    await webhook(status("ref-f", "failed"));
    await webhook(status("ref-f", "sent"));

    const snap = await (await grader("snapshot")).json();
    assert.equal(snap.workspaces.ws_acme.outbound["ref-d"], "delivered");
    assert.equal(snap.workspaces.ws_acme.outbound["ref-f"], "failed");
  });
});

describe("Grader auth and reset", () => {
  it("401 without the token on every grader endpoint", async () => {
    for (const [method, path] of [["POST", "reset"], ["GET", "snapshot"], ["POST", "reply"], ["POST", "claim"]]) {
      const res = await fetch(`${baseUrl}/__grader/${path}`, { method });
      assert.equal(res.status, 401, path);
    }
  });

  it("reset deletes application data but keeps workspaces and sessions", async () => {
    await webhook(inbound("ws_acme", "+14155550101", Date.now()));
    const sessionId = await createSession({ sub: "u_ben", workspaces: [{ id: "ws_acme", role: "agent" }] });

    assert.equal((await grader("reset", {})).status, 200);
    assert.equal(await Message.countDocuments(), 0);
    assert.equal(await Conversation.countDocuments(), 0);

    const res = await fetch(`${baseUrl}/api/conversations?workspace=ws_acme`, {
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
    });
    assert.equal(res.status, 200, "session survives reset and the workspace still exists");
  });
});
