import Message from "../models/message.model.js";
import Workspace from "../models/workspace.model.js";
import { touchConversation } from "./conversation.service.js";
import { publishEvent } from "./realtime.service.js";
import { wakeOutboundWorker } from "../workers/outbound.worker.js";
import { notFound } from "../utils/httpError.js";

const isDuplicateKey = (error) => error?.code === 11000;

// Stores an agent's reply in the outbox. Used by the UI route and by /__grader/reply.
//
// Once this resolves, the reply is safely in MongoDB and will reach Pigeon even if
// this process dies right now (see workers/outbound.worker.js). The unique index on
// { workspaceId, clientRef } makes a repeated clientRef, even at the same instant,
// the same single reply: { created: false } is returned with the stored message.
export const enqueueReply = async ({ workspaceId, contact, text, clientRef, senderId = null }) => {
  const workspaceExists = await Workspace.exists({ workspaceId });
  if (!workspaceExists) throw notFound("Workspace not found");

  const existing = await Message.findOne({ workspaceId, clientRef }).lean();
  if (existing) return { message: existing, created: false };

  const now = new Date();
  const conversation = await touchConversation({ workspaceId, contact, activityAt: now, text });

  let message;
  try {
    message = await Message.create({
      workspaceId,
      conversationId: conversation._id,
      contact,
      senderType: "agent",
      senderId,
      text,
      direction: "outbound",
      status: "queued",
      clientRef,
      occurredAt: now,
      sendState: "pending",
      nextAttemptAt: now,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    return { message: await Message.findOne({ workspaceId, clientRef }).lean(), created: false };
  }

  await publishEvent(workspaceId, {
    type: "message.outbound",
    contact,
    client_ref: clientRef,
    status: "queued",
    text,
    sender: senderId,
  });

  wakeOutboundWorker();
  return { message: message.toObject(), created: true };
};
