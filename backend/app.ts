import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./modules/auth/auth.routes.js";
import projectRoutes from "./modules/projects/project.routes.js";
import fileRoutes from "./modules/files/file.routes.js";
import githubRoutes from "./modules/github/github.routes.js";
import collaboratorRoutes from "./modules/collaborators/collaborator.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", fileRoutes);
app.use("/api/github", githubRoutes);
app.use("/api", collaboratorRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Mesh backend is running",
  });
});

export default app;