import { Router } from "express";
import { requireSession } from "../middleware/auth.middleware.js";
import { requireWorkspace } from "../middleware/workspace.middleware.js";
import {
  listConversations,
  getConversationMessages,
  claimConversationForMe,
  changeStatus,
  replyToConversation,
} from "../controllers/conversation.controller.js";

const router = Router();

// Every route here needs a session (401) and membership of the workspace (403).
router.use(requireSession, requireWorkspace);

router.get("/", listConversations);
router.get("/:conversationId/messages", getConversationMessages);
router.post("/:conversationId/messages", replyToConversation);
router.post("/:conversationId/claim", claimConversationForMe);
router.post("/:conversationId/close", changeStatus("closed"));
router.post("/:conversationId/reopen", changeStatus("open"));

export default router;
