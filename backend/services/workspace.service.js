import Workspace from "../models/workspace.model.js";
import env from "../config/env.js";

const isDuplicateKey = (error) => error?.code === 11000;

// Makes sure every workspace configured through PIGEON_KEY_WS_* exists in MongoDB.
// Upserts are idempotent, so several server copies can run this at the same time.
export const syncWorkspacesFromEnv = async () => {
  const workspaceIds = Object.keys(env.pigeonKeys);
  if (workspaceIds.length === 0) return [];

  try {
    await Workspace.bulkWrite(
      workspaceIds.map((workspaceId) => ({
        updateOne: {
          filter: { workspaceId },
          update: { $setOnInsert: { workspaceId, name: workspaceId } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    // Another copy inserted the same workspace a moment earlier: that is fine.
    if (!isDuplicateKey(error)) throw error;
  }

  return workspaceIds;
};
