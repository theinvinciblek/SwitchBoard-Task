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

export default connectDb;
