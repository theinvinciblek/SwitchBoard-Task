import env from "./config/env.js";
import app from "./app.js";
import { connectDb, disconnectDb } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";

const start = async () => {
  // Server only starts listening after BOTH stores are connected.
  const results = await Promise.allSettled([connectDb(), connectRedis()]);
  if (results.some((r) => r.status === "rejected")) {
    console.error("Startup aborted: could not connect to data stores");
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close();
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start();
