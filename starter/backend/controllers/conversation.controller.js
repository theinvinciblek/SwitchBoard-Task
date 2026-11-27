import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import { notFound } from "../utils/httpError.js";

// GET /api/conversations?workspace=<id>&page=1&limit=20
export const listConversations = async (req, res) => {
  const pagination = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId };

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      // _id breaks ties so the order is stable between pages.
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  res.json({ conversations, pagination: paginationMeta(pagination, total) });
};

// GET /api/conversations/:conversationId/messages?workspace=<id>
export const getConversationMessages = async (req, res) => {
  const { conversationId } = req.params;

  if (!mongoose.isValidObjectId(conversationId)) throw notFound("Conversation not found");

  // Filtering by workspaceId as well as _id means a conversation from another
  // workspace looks exactly like one that doesn't exist (404, nothing leaked).
  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId: req.workspaceId,
  }).lean();

  if (!conversation) throw notFound("Conversation not found");

  const messages = await Message.find({
    workspaceId: req.workspaceId,
    conversationId: conversation._id,
  })
    .sort({ createdAt: 1, _id: 1 }) // oldest first, as a chat reads
    .lean();

  res.json({ conversation, messages });
};
