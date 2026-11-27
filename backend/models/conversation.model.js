import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
    },

    // The customer's address on Pigeon, e.g. "+14155550101".
    contact: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },

    // The agent (IdP `sub`) holding the conversation, or null.
    assignee: {
      type: String,
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    lastMessageText: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One conversation per contact per workspace.
conversationSchema.index({ workspaceId: 1, contact: 1 }, { unique: true });

// Inbox listing: a workspace's conversations, newest activity first.
conversationSchema.index({ workspaceId: 1, lastMessageAt: -1, _id: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
