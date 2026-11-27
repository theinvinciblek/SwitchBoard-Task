
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import pigeonWebhookRoutes from "./routes/pigeonWebhook.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import graderRoutes from "./routes/grader.routes.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.WEB_ORIGIN,
    credentials: true,
  })
);

app.use(morgan("dev"));

// Health check
app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Switchboard API is running",
  });
});

// Pigeon webhook must come before express.json()
// because signature verification requires the raw body.
app.use("/webhooks", pigeonWebhookRoutes);

// Parse JSON for normal API requests
app.use(express.json());

// Login (OIDC) and /api/me
app.use(authRoutes);

// Conversation APIs
app.use("/api/conversations", conversationRoutes);

// Grader check endpoints (contract D in BRIEF.md)
app.use("/__grader", graderRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Client errors (4xx) are expected traffic; only log real server errors.
  if (!err.status || err.status >= 500) console.error("Server error:", err);

  res.status(err.status || 500).json({
    message: err.status ? err.message : "Internal server error",
  });
});

export default app;
