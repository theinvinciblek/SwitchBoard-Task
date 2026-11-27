import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    occurredAt: {
      type: Date,
      required: true,
    },

    processed: {
      type: Boolean,
      default: false,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

webhookEventSchema.index({ workspaceId: 1, eventId: 1 }, { unique: true });

const WebhookEvent = mongoose.model(
  "WebhookEvent",
  webhookEventSchema
);

export default WebhookEvent;
