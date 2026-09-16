import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";

import {
  connectGithubController,
  getGithubConnectionController,
  disconnectGithubController,
  getGithubRepositoryContentsController,
  githubCallbackController,
} from "./github.controller.js";

const router = Router();

router.get("/connect",requireAuth,connectGithubController);
router.get("/callback",githubCallbackController);
router.get("/connection",requireAuth,getGithubConnectionController);
router.delete("/connection",requireAuth,disconnectGithubController);
router.get("/repository/contents",requireAuth,getGithubRepositoryContentsController);

export default router;