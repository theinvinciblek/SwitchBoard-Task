import { Router } from "express";
import { login, callback, logout, me } from "../controllers/auth.controller.js";
import { requireSession } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/auth/login", login);
router.get("/auth/callback", callback);
router.post("/auth/logout", logout);
router.get("/api/me", requireSession, me);

export default router;
