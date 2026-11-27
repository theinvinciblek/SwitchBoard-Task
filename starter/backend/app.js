import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import env from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.webOrigin, credentials: true }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(express.json());

app.use(healthRoutes);
app.use("/api/conversations", conversationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
