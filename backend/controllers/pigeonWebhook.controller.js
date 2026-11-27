
import Workspace from "../models/workspace.model.js";
import WebhookEvent from "../models/webhook.model.js";
import Message from "../models/message.model.js";
import { touchConversation } from "../services/conversation.service.js";
import { publishEvent } from "../services/realtime.service.js";

// A status only ever moves forward: queued -> sent -> delivered | failed.
// Pigeon does not keep order, so a late "sent" must not overwrite "delivered" or "failed".
const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, failed: 2 };

const markProcessed = (event) =>
  WebhookEvent.updateOne(
    { eventId: event.id, workspaceId: event.workspace },
    { $set: { processed: true } }
  );

const handleStatus = async (event) => {
  const { message_id, client_ref, status } = event.data;

  // Status values we do not know, or a status without a client_ref, are ignored.
  if (typeof client_ref !== "string" || !(status in STATUS_RANK) || status === "queued") {
    return;
  }

  const lowerStatuses = Object.keys(STATUS_RANK).filter(
    (s) => STATUS_RANK[s] < STATUS_RANK[status]
  );

  // Atomic: only moves the status forward. Matches nothing for a message we never
  // sent (ignored, as PIGEON.md requires) or one that is already further along.
  const updated = await Message.findOneAndUpdate(
    {
      workspaceId: event.workspace,
      clientRef: client_ref,
      direction: "outbound",
      status: { $in: lowerStatuses },
    },
    {
      $set: {
        status,
        ...(typeof message_id === "string" ? { pigeonMessageId: message_id } : {}),
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (updated) {
    await publishEvent(event.workspace, {
      type: "message.status",
      contact: updated.contact,
      client_ref,
      status,
    });
  }
};

const handleInbound = async (event, occurredAt) => {
  const { message_id, from, text } = event.data;

  // Find or create the conversation atomically. lastMessageAt only moves forward,
  // because an older message can arrive after a newer one.
  const conversation = await touchConversation({
    workspaceId: event.workspace,
    contact: from,
    activityAt: occurredAt,
    text,
    reopen: true,
  });

  // Save the inbound message without creating duplicates
  const result = await Message.updateOne(
    {
      workspaceId: event.workspace,
      pigeonMessageId: message_id,
    },
    {
      $setOnInsert: {
        conversationId: conversation._id,
        contact: from,
        senderType: "customer",
        senderId: null,
        text,
        direction: "inbound",
        status: "delivered",
        occurredAt,
      },
    },
    { upsert: true }
  );

  // Only the request that stored the message announces it.
  if (result.upsertedCount === 1) {
    await publishEvent(event.workspace, {
      type: "message.inbound",
      contact: from,
      message_id,
      text,
      occurred_at: occurredAt.toISOString(),
    });
  }
};

export const handlePigeonWebhook = async (req, res) => {
  try {
    const event = req.body;

    // Validate the basic webhook payload structure
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      typeof event.workspace !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid webhook payload",
      });
    }

    const isKnownType = event.type === "message.inbound" || event.type === "message.status";

    // Event types we do not know are acknowledged: Pigeon adds types without notice.
    if (!isKnownType) {
      return res.sendStatus(200);
    }

    const occurredAt = new Date(event.occurred_at);

    if (
      Number.isNaN(occurredAt.getTime()) ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return res.status(400).json({
        message: "Invalid webhook payload",
      });
    }

    if (event.type === "message.inbound") {
      const { message_id, from, text } = event.data;

      if (typeof message_id !== "string" || typeof from !== "string" || typeof text !== "string") {
        return res.status(400).json({
          message: "Invalid inbound message",
        });
      }
    }

    // Verify that the workspace exists
    const workspace = await Workspace.exists({
      workspaceId: event.workspace,
    });

    // Ignore events belonging to unknown workspaces
    if (!workspace) {
      return res.sendStatus(200);
    }

    // Record the event. A duplicate is only skipped if the earlier copy finished
    // processing: if it was stored but the process died (or failed) before the
    // message was saved, the retry processes it again. Every step below is
    // idempotent, so processing twice is safe.
    try {
      await WebhookEvent.create({
        eventId: event.id,
        workspaceId: event.workspace,
        eventType: event.type,
        occurredAt,
        payload: event,
        processed: false,
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      const existing = await WebhookEvent.findOne({ eventId: event.id }).lean();

      if (existing?.processed) {
        return res.sendStatus(200);
      }
    }

    if (event.type === "message.status") {
      await handleStatus(event);
    } else {
      await handleInbound(event, occurredAt);
    }

    // Mark the event as successfully processed
    await markProcessed(event);

    return res.sendStatus(200);
  } catch (error) {
    // Not stored: answer 5xx so Pigeon retries.
    console.error("Pigeon webhook error:", error);

    return res.sendStatus(500);
  }
};
