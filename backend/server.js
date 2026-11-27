import env from "./config/env.js";
import app from "./app.js";
import { connectDb, disconnectDb, ensureIndexes } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { syncWorkspacesFromEnv } from "./services/workspace.service.js";
import { attachWebSocketServer, closeWebSocketServer } from "./services/websocket.service.js";
import { startOutboundWorker, stopOutboundWorker } from "./workers/outbound.worker.js";

const start = async () => {
  // Server only starts listening after BOTH stores are connected.
  const results = await Promise.allSettled([connectDb(), connectRedis()]);
  if (results.some((r) => r.status === "rejected")) {
    console.error("Startup aborted: could not connect to data stores");
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(1);
  }

  try {
    await ensureIndexes();
    const workspaces = await syncWorkspacesFromEnv();
    console.log(`Workspaces: ${workspaces.join(", ") || "none configured"}`);
  } catch (error) {
    console.error("Startup aborted: could not prepare the database:", error.message);
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });

  try {
    await attachWebSocketServer(server);
  } catch (error) {
    console.error("Startup aborted: could not start real-time events:", error.message);
    process.exit(1);
  }

  // Also picks up replies a previous run (or a dead copy) accepted but did not send.
  startOutboundWorker();

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    stopOutboundWorker();
    await closeWebSocketServer().catch(() => {});
    server.close();
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start();
