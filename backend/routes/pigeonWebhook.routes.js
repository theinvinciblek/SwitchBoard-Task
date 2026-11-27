
import express from "express";
import crypto from "crypto";
import { handlePigeonWebhook } from "../controllers/pigeonWebhook.controller.js";
import verifyPigeonSignature from "../utils/verifyPigeonSignature.js";

const router = express.Router();

router.post(
  "/pigeon",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res, next) => {
    const rawBody = req.body.toString("utf8");

    const signature = req.headers["x-pigeon-signature"];
    const secret = process.env.PIGEON_WEBHOOK_SECRET;

    if (!verifyPigeonSignature(signature, rawBody, secret)) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }

    try {
      req.body = JSON.parse(rawBody);
      next();
    } catch {
      return res.status(400).json({ message: "Invalid JSON payload" });
    }
  },
  handlePigeonWebhook
);

export default router;
