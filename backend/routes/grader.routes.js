import { Router } from "express";
import { requireGraderToken } from "../middleware/graderAuth.middleware.js";
import { claim, reply, reset, snapshot } from "../controllers/grader.controller.js";

const router = Router();

// Every grader endpoint requires the x-grader-token header.
router.use(requireGraderToken);

router.post("/reset", reset);
router.get("/snapshot", snapshot);
router.post("/reply", reply);
router.post("/claim", claim);

export default router;
