import { Router } from "express";
import { requireWorkspace } from "../middleware/workspace.middleware.js";
import {
  listConversations,
  getConversationMessages,
} from "../controllers/conversation.controller.js";

const router = Router();

// Every route here is scoped to one workspace.
router.use(requireWorkspace);

router.get("/", listConversations);
router.get("/:conversationId/messages", getConversationMessages);

export default router;
