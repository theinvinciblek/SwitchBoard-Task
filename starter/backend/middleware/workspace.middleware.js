import Workspace from "../models/workspace.model.js";
import { badRequest, notFound } from "../utils/httpError.js";

// Resolves ?workspace=<id> into req.workspaceId. Every workspace-scoped route goes
// through this, and controllers must use req.workspaceId in every query filter.
// Once login exists, this is also where membership is checked (401 / 403).
export const requireWorkspace = async (req, res, next) => {
  const { workspace } = req.query;

  if (typeof workspace !== "string" || !workspace.trim()) {
    throw badRequest("workspace query parameter is required");
  }

  const exists = await Workspace.exists({ workspaceId: workspace.trim() });
  if (!exists) throw notFound("Workspace not found");

  req.workspaceId = workspace.trim();
  next();
};
