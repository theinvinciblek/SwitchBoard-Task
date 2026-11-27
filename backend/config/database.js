import mongoose from "mongoose";
import env from "./env.js";

export const connectDb = async () => {
  try {
    await mongoose.connect(env.mongoUrl, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }

  mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  mongoose.connection.on("error", (err) => console.error("MongoDB error:", err.message));
};

export const disconnectDb = () => mongoose.connection.close();

export const isDbReady = () => mongoose.connection.readyState === 1;

// Builds the indexes declared in every registered model and waits for them.
// Unique indexes (e.g. one conversation per workspace + contact) are what make
// concurrent upserts safe, so the server must not take traffic before they exist.
export const ensureIndexes = () =>
  Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));

export default connectDb;
