import Workspace from "../models/workspace.model.js";
import { badRequest, notFound, HttpError } from "../utils/httpError.js";

// Resolves ?workspace=<id> into req.workspaceId. Every workspace-scoped route goes
// through this, and controllers must use req.workspaceId in every query filter.
// Runs after requireSession: a signed-in user who is not a member gets 403.
export const requireWorkspace = async (req, res, next) => {
  const { workspace } = req.query;

  if (typeof workspace !== "string" || !workspace.trim()) {
    throw badRequest("workspace query parameter is required");
  }

  const workspaceId = workspace.trim();

  // Membership comes from the IdP's workspaces claim, stored in the session.
  // Checked before existence, so a non-member learns nothing about the workspace.
  const membership = req.user?.workspaces?.find((w) => w.id === workspaceId);
  if (!membership) throw new HttpError(403, "Not a member of this workspace");

  const exists = await Workspace.exists({ workspaceId });
  if (!exists) throw notFound("Workspace not found");

  req.workspaceId = workspaceId;
  req.workspaceRole = membership.role;
  next();
};
