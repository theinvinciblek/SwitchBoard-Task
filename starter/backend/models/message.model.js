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
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: 1 });

messageSchema.index(
  { workspaceId: 1, clientRef: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientRef: { $type: "string" },
    },
  }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;