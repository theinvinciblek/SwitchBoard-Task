import Conversation from "../models/conversation.model.js";
import Workspace from "../models/workspace.model.js";
import { notFound } from "../utils/httpError.js";
import { publishEvent } from "./realtime.service.js";

const isDuplicateKey = (error) => error?.code === 11000;

// Claims a contact's conversation for an agent.
// Returns { claimed: true, conversation } if the agent now holds it (newly or already),
// or { claimed: false, conversation } if another agent holds it.
//
// Atomicity:
// 1. Upsert the conversation on { workspaceId, contact }. The unique index on that
//    pair means concurrent claims for a new contact create exactly one document.
// 2. A single findOneAndUpdate that only matches when the conversation is unassigned
//    or already held by this agent. MongoDB applies single-document updates atomically,
//    so of N simultaneous claims exactly one can match `assignee: null`.
export const claimConversation = async ({ workspaceId, contact, agent }) => {
  const workspaceExists = await Workspace.exists({ workspaceId });
  if (!workspaceExists) throw notFound("Workspace not found");

  try {
    await Conversation.updateOne(
      { workspaceId, contact },
      { $setOnInsert: { assignee: null } },
      { upsert: true }
    );
  } catch (error) {
    // A concurrent claim inserted it first; the document exists now, which is all we need.
    if (!isDuplicateKey(error)) throw error;
  }

  // returnDocument "before" tells us whether this call changed the holder,
  // so the assignment event is published once, not on every repeated claim.
  const before = await Conversation.findOneAndUpdate(
    { workspaceId, contact, assignee: { $in: [null, agent] } },
    { $set: { assignee: agent } },
    { returnDocument: "before" }
  ).lean();

  if (before) {
    if (before.assignee !== agent) {
      await publishEvent(workspaceId, { type: "conversation.assigned", contact, assignee: agent });
    }
    return { claimed: true, conversation: { ...before, assignee: agent } };
  }

  const current = await Conversation.findOne({ workspaceId, contact }).lean();
  return { claimed: false, conversation: current };
};

// Finds or creates the conversation for a contact, atomically, and moves its
// lastMessageAt forward to `activityAt` (never backwards: events arrive out of order).
export const touchConversation = async ({ workspaceId, contact, activityAt, text, reopen = false }) => {
  const update = {
    $setOnInsert: { assignee: null, ...(reopen ? {} : { status: "open" }) },
    $max: { lastMessageAt: activityAt },
  };
  if (reopen) update.$set = { status: "open" };

  const upsert = () =>
    Conversation.findOneAndUpdate({ workspaceId, contact }, update, {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: false,
    }).lean();

  let conversation;
  try {
    conversation = await upsert();
  } catch (error) {
    // Two first messages from a new contact at the same instant: the other insert won.
    if (!isDuplicateKey(error)) throw error;
    conversation = await upsert();
  }

  // Only the newest message sets the preview text.
  if (text !== undefined && conversation.lastMessageAt.getTime() === activityAt.getTime()) {
    await Conversation.updateOne(
      { _id: conversation._id, lastMessageAt: activityAt },
      { $set: { lastMessageText: text } }
    );
    conversation.lastMessageText = text;
  }

  return conversation;
};

// Close or reopen a conversation in a workspace. Returns the updated conversation, or null.
export const setConversationStatus = async ({ workspaceId, conversationId, status }) => {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, workspaceId },
    { $set: { status } },
    { returnDocument: "after" }
  ).lean();

  if (conversation) {
    await publishEvent(workspaceId, { type: "conversation.status", contact: conversation.contact, status });
  }
  return conversation;
};
