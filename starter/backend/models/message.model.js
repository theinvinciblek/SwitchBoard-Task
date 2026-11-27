
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    senderType: {
      type: String,
      enum: ["customer", "agent"],
      required: true,
    },

    senderId: {
      type: String,
      default: null,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },

    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "failed"],
      default: "queued",
    },

    pigeonMessageId: {
      type: String,
      default: null,
    },

    clientRef: {
      type: String,
      default: null,
    },

    // The customer's address, copied from the conversation.
    contact: {
      type: String,
      default: null,
    },

    // When the message happened: Pigeon's occurred_at for inbound, enqueue time for outbound.
    // Messages are shown in this order, never in arrival order.
    occurredAt: {
      type: Date,
      default: Date.now,
    },

    // Outbox fields, outbound only. "pending" means it still has to reach Pigeon.
    sendState: {
      type: String,
      enum: ["pending", "done", null],
      default: null,
    },

    nextAttemptAt: {
      type: Date,
      default: null,
    },

    // Lease: a worker owns the send until this time. A crashed worker's lease expires.
    lockedUntil: {
      type: Date,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Conversation message ordering
messageSchema.index({
  workspaceId: 1,
  conversationId: 1,
  createdAt: 1,
});

// Display order within a conversation
messageSchema.index({ workspaceId: 1, conversationId: 1, occurredAt: 1, _id: 1 });

// Outbox: due sends
messageSchema.index(
  { sendState: 1, nextAttemptAt: 1 },
  { partialFilterExpression: { sendState: "pending" } }
);

// Prevent duplicate outbound client references
messageSchema.index(
  {
    workspaceId: 1,
    clientRef: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      clientRef: { $type: "string" },
    },
  }
);

// Prevent duplicate inbound Pigeon messages
messageSchema.index(
  {
    workspaceId: 1,
    pigeonMessageId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      pigeonMessageId: { $type: "string" },
    },
  }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
