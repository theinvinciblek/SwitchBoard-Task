import Workspace from "../models/workspace.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import WebhookEvent from "../models/webhook.model.js";
import { redisClient } from "../config/redis.js";
import { syncWorkspacesFromEnv } from "./workspace.service.js";

// Deletes all application data. Workspaces are configuration (from .env), so they are
// re-created; login sessions ("auth:*") and the real-time seq counters ("rt:*") stay.
// deleteMany, not drop: dropping a collection would also drop its unique indexes.
export const resetAll = async () => {
  await Promise.all([
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);

  for await (const keys of redisClient.scanIterator({ MATCH: "sb:*", COUNT: 500 })) {
    const batch = Array.isArray(keys) ? keys : [keys];
    if (batch.length) await redisClient.del(batch);
  }

  await syncWorkspacesFromEnv();
};

const byOccurred = (a, b) =>
  (a.occurredAt ?? a.createdAt) - (b.occurredAt ?? b.createdAt) || String(a._id).localeCompare(String(b._id));

// The shape BRIEF.md specifies:
// { workspaces: { <ws>: { contacts: { <contact>: { inbound: [ids], assignee } }, outbound: { <ref>: status } } } }
export const buildSnapshot = async () => {
  const [workspaces, conversations, inbound, outbound] = await Promise.all([
    Workspace.find({}, { workspaceId: 1 }).lean(),
    Conversation.find({}, { workspaceId: 1, contact: 1, assignee: 1 }).lean(),
    Message.find(
      { direction: "inbound", pigeonMessageId: { $type: "string" } },
      { workspaceId: 1, conversationId: 1, pigeonMessageId: 1, occurredAt: 1, createdAt: 1 }
    ).lean(),
    Message.find(
      { direction: "outbound", clientRef: { $type: "string" } },
      { workspaceId: 1, clientRef: 1, status: 1 }
    ).lean(),
  ]);

  const result = { workspaces: {} };
  const ensureWorkspace = (id) => (result.workspaces[id] ??= { contacts: {}, outbound: {} });
  for (const { workspaceId } of workspaces) ensureWorkspace(workspaceId);

  const byId = new Map();
  for (const conversation of conversations) {
    byId.set(String(conversation._id), conversation);
    ensureWorkspace(conversation.workspaceId).contacts[conversation.contact] = {
      inbound: [],
      assignee: conversation.assignee ?? null,
    };
  }

  inbound.sort(byOccurred);
  for (const message of inbound) {
    const conversation = byId.get(String(message.conversationId));
    // Both ids must agree on the workspace; anything else is not shown.
    if (!conversation || conversation.workspaceId !== message.workspaceId) continue;
    ensureWorkspace(message.workspaceId).contacts[conversation.contact].inbound.push(message.pigeonMessageId);
  }

  for (const message of outbound) {
    ensureWorkspace(message.workspaceId).outbound[message.clientRef] = message.status;
  }

  return result;
};
