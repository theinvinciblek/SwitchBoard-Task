import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Configure the environment before any app module loads (env.js reads it at import time).
// Tests always use their own database, never the dev one.
const GRADER_TOKEN = "test-grader-token";
process.env.MONGO_URL = process.env.TEST_MONGO_URL || "mongodb://localhost:27017/switchboard_test";
process.env.GRADER_TOKEN = GRADER_TOKEN;
process.env.PIGEON_KEY_WS_ACME ||= "pk_test_acme";
process.env.PIGEON_KEY_WS_GLOBEX ||= "pk_test_globex";

const { default: mongoose } = await import("mongoose");
const { default: app } = await import("../app.js");
const { connectDb, disconnectDb, ensureIndexes } = await import("../config/database.js");
const { syncWorkspacesFromEnv } = await import("../services/workspace.service.js");
const { default: Conversation } = await import("../models/conversation.model.js");
const { connectRedis, disconnectRedis } = await import("../config/redis.js");
const { createSession, deleteSession, SESSION_COOKIE } = await import("../services/session.service.js");

let server;
let baseUrl;

const claim = async (body, token = GRADER_TOKEN) => {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers["x-grader-token"] = token;
  const res = await fetch(`${baseUrl}/__grader/claim`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

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
  await Conversation.deleteMany({});
});

describe("POST /__grader/claim: authentication", () => {
  it("returns 401 without the x-grader-token header", async () => {
    const res = await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" }, null);
    assert.equal(res.status, 401);
  });

  it("returns 401 with a wrong token", async () => {
    const res = await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" }, "wrong");
    assert.equal(res.status, 401);
    assert.equal(await Conversation.countDocuments(), 0);
  });
});

describe("POST /__grader/claim: invalid input", () => {
  const cases = [
    ["empty body", {}],
    ["missing agent", { workspace: "ws_acme", contact: "+14155550101" }],
    ["empty contact", { workspace: "ws_acme", contact: "  ", agent: "u_ben" }],
    ["non-string workspace", { workspace: 123, contact: "+14155550101", agent: "u_ben" }],
    ["object agent", { workspace: "ws_acme", contact: "+14155550101", agent: { $ne: null } }],
  ];

  for (const [name, body] of cases) {
    it(`returns 400 for ${name}`, async () => {
      const res = await claim(body);
      assert.equal(res.status, 400);
    });
  }

  it("returns 400 for malformed JSON", async () => {
    const res = await claim("{not json");
    assert.equal(res.status, 400);
  });

  it("returns 404 for an unknown workspace and creates nothing", async () => {
    const res = await claim({ workspace: "ws_unknown", contact: "+14155550101", agent: "u_ben" });
    assert.equal(res.status, 404);
    assert.equal(await Conversation.countDocuments(), 0);
  });
});

describe("POST /__grader/claim: claiming", () => {
  it("creates the conversation when the contact has not written yet, and assigns it", async () => {
    const res = await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" });

    assert.equal(res.status, 200);
    assert.equal(res.body.assignee, "u_ben");
    assert.equal(res.body.workspace, "ws_acme");
    assert.equal(res.body.contact, "+14155550101");

    const stored = await Conversation.find({ workspaceId: "ws_acme", contact: "+14155550101" }).lean();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].assignee, "u_ben");
    assert.equal(stored[0].status, "open");
  });

  it("claims an existing unassigned conversation", async () => {
    const existing = await Conversation.create({ workspaceId: "ws_acme", contact: "+14155550102" });
    const res = await claim({ workspace: "ws_acme", contact: "+14155550102", agent: "u_ben" });

    assert.equal(res.status, 200);
    assert.equal(res.body.conversationId, String(existing._id));
    assert.equal((await Conversation.findById(existing._id)).assignee, "u_ben");
  });

  it("returns 200 when the holder claims again", async () => {
    await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" });
    const res = await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" });

    assert.equal(res.status, 200);
    assert.equal(res.body.assignee, "u_ben");
    assert.equal(await Conversation.countDocuments(), 1);
  });

  it("returns 409 when another agent already holds it, and keeps the holder", async () => {
    await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" });
    const res = await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_eli" });

    assert.equal(res.status, 409);
    assert.equal(res.body.assignee, "u_ben");
    const stored = await Conversation.findOne({ workspaceId: "ws_acme", contact: "+14155550101" });
    assert.equal(stored.assignee, "u_ben");
  });
});

describe("POST /__grader/claim: simultaneous claims", () => {
  // Same shape as the harness: 6 agents at the same instant, on 5 contacts at once.
  const AGENTS = Array.from({ length: 6 }, (_, i) => `check_agent_${i + 1}`);
  const CONTACTS = ["+442079460201", "+442079460202", "+442079460203", "+4930901820204", "+34600111205"];

  const race = (contact) =>
    Promise.all(AGENTS.map((agent) => claim({ workspace: "ws_globex", contact, agent })));

  const assertOneWinner = async (contact, results) => {
    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status === 409);

    assert.equal(winners.length, 1, `${contact}: expected exactly one 200, got ${winners.length}`);
    assert.equal(losers.length, AGENTS.length - 1, `${contact}: every other request must be 409`);

    const winner = winners[0].body.assignee;
    for (const loser of losers) assert.equal(loser.body.assignee, winner);

    const stored = await Conversation.find({ workspaceId: "ws_globex", contact }).lean();
    assert.equal(stored.length, 1, `${contact}: expected one conversation document`);
    assert.equal(stored[0].assignee, winner, `${contact}: stored assignee must be the winner`);
  };

  it("gives exactly one winner when the conversation does not exist yet", async () => {
    const all = await Promise.all(CONTACTS.map(race));
    for (const [i, results] of all.entries()) await assertOneWinner(CONTACTS[i], results);
  });

  it("gives exactly one winner when the conversation already exists unassigned", async () => {
    await Conversation.create(CONTACTS.map((contact) => ({ workspaceId: "ws_globex", contact })));
    const all = await Promise.all(CONTACTS.map(race));
    for (const [i, results] of all.entries()) await assertOneWinner(CONTACTS[i], results);
  });

  it("stays correct over repeated rounds", async () => {
    for (let round = 0; round < 10; round++) {
      await Conversation.deleteMany({});
      const all = await Promise.all(CONTACTS.map(race));
      for (const [i, results] of all.entries()) await assertOneWinner(CONTACTS[i], results);
    }
  });
});

describe("POST /__grader/claim: workspace isolation", () => {
  const CONTACT = "+14155550101";

  it("treats the same contact in two workspaces as two separate conversations", async () => {
    const acme = await claim({ workspace: "ws_acme", contact: CONTACT, agent: "u_ben" });
    const globex = await claim({ workspace: "ws_globex", contact: CONTACT, agent: "u_dev" });

    assert.equal(acme.status, 200);
    assert.equal(globex.status, 200, "a claim in ws_acme must not block ws_globex");
    assert.notEqual(acme.body.conversationId, globex.body.conversationId);

    const acmeDoc = await Conversation.findOne({ workspaceId: "ws_acme", contact: CONTACT });
    const globexDoc = await Conversation.findOne({ workspaceId: "ws_globex", contact: CONTACT });
    assert.equal(acmeDoc.assignee, "u_ben");
    assert.equal(globexDoc.assignee, "u_dev");
  });

  it("does not reveal or change another workspace's holder", async () => {
    await claim({ workspace: "ws_acme", contact: CONTACT, agent: "u_ben" });
    const res = await claim({ workspace: "ws_globex", contact: CONTACT, agent: "u_dev" });

    assert.equal(res.status, 200);
    assert.equal(res.body.assignee, "u_dev");
    assert.equal(res.body.workspace, "ws_globex");
    const acmeDoc = await Conversation.findOne({ workspaceId: "ws_acme", contact: CONTACT });
    assert.equal(acmeDoc.assignee, "u_ben");
  });

  it("keeps claimed conversations out of the other workspace's inbox listing", async () => {
    await claim({ workspace: "ws_acme", contact: "+14155550101", agent: "u_ben" });
    await claim({ workspace: "ws_acme", contact: "+14155550102", agent: "u_ben" });
    await claim({ workspace: "ws_globex", contact: "+442079460201", agent: "u_dev" });

    // u_eli is a member of both workspaces, so both listings are allowed.
    const sessionId = await createSession({
      sub: "u_eli",
      workspaces: [{ id: "ws_acme", role: "agent" }, { id: "ws_globex", role: "agent" }],
    });
    const headers = { cookie: `${SESSION_COOKIE}=${sessionId}` };
    const acme = await (await fetch(`${baseUrl}/api/conversations?workspace=ws_acme`, { headers })).json();
    const globex = await (await fetch(`${baseUrl}/api/conversations?workspace=ws_globex`, { headers })).json();
    await deleteSession(sessionId);

    assert.equal(acme.pagination.total, 2);
    assert.ok(acme.conversations.every((c) => c.workspaceId === "ws_acme"));
    assert.equal(globex.pagination.total, 1);
    assert.equal(globex.conversations[0].contact, "+442079460201");
    assert.equal(globex.conversations[0].assignee, "u_dev");
  });
});
