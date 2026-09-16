import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { connectGithubController, getGithubRepositoryContentsController, githubCallbackController } from "./github.controller.js";

const router = Router();

router.get("/connect", requireAuth, connectGithubController);
router.get("/callback", githubCallbackController);
router.get("/repository/contents", requireAuth, getGithubRepositoryContentsController);

export default router;