import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { addCollaboratorController } from "./collaborator.controller.js";

const router = Router();

router.post("/projects/:projectId/collaborators", requireAuth, addCollaboratorController);

export default router;