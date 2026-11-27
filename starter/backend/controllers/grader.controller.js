import { claimConversation } from "../services/conversation.service.js";
import { enqueueReply } from "../services/message.service.js";
import { resetAll, buildSnapshot } from "../services/grader.service.js";
import { badRequest } from "../utils/httpError.js";

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

// POST /__grader/claim  { workspace, contact, agent }
// 200 if this agent now holds the conversation, 409 if another agent does.
export const claim = async (req, res) => {
  const { workspace, contact, agent } = req.body ?? {};

  if (![workspace, contact, agent].every(isNonEmptyString)) {
    throw badRequest("workspace, contact and agent must be non-empty strings");
  }

  const { claimed, conversation } = await claimConversation({
    workspaceId: workspace.trim(),
    contact: contact.trim(),
    agent: agent.trim(),
  });

  const body = {
    conversationId: conversation._id,
    workspace: conversation.workspaceId,
    contact: conversation.contact,
    assignee: conversation.assignee,
  };

  if (!claimed) {
    return res.status(409).json({ error: "Conversation is claimed by another agent", ...body });
  }

  res.status(200).json(body);
};

// POST /__grader/reply  { workspace, contact, text, client_ref }
// 202 once the reply is stored; the same client_ref again is the same reply (also 202).
export const reply = async (req, res) => {
  const { workspace, contact, text, client_ref: clientRef } = req.body ?? {};

  if (![workspace, contact, text, clientRef].every(isNonEmptyString)) {
    throw badRequest("workspace, contact, text and client_ref must be non-empty strings");
  }

  const { message, created } = await enqueueReply({
    workspaceId: workspace.trim(),
    contact: contact.trim(),
    text: text.trim(),
    clientRef: clientRef.trim(),
  });

  res.status(202).json({ client_ref: message.clientRef, status: message.status, duplicate: !created });
};

// POST /__grader/reset
export const reset = async (req, res) => {
  await resetAll();
  res.status(200).json({ ok: true });
};

// GET /__grader/snapshot
export const snapshot = async (req, res) => {
  res.status(200).json(await buildSnapshot());
};
