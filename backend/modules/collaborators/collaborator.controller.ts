import type { Request, Response } from "express";

import { addCollaborator } from "./collaborator.service.js";

export async function addCollaboratorController(req: Request, res: Response) {
    try {
        const { projectId } = req.params;
        const { identifier } = req.body;

        if (typeof projectId !== "string" || !identifier) {
            return res.status(400).json({
                success: false,
                message: "Project ID and username/email are required",
            });
        }

        const collaborator = await addCollaborator(
            projectId,
            req.userId,
            identifier,
        );

        return res.status(201).json({
            success: true,
            message: "Collaborator added successfully",
            collaborator,
        });
    } catch (error) {
        console.error("Add collaborator error:", error);

        if (error instanceof Error) {
            switch (error.message) {
                case "PROJECT_NOT_FOUND_OR_NOT_OWNER":
                    return res.status(404).json({
                        success: false,
                        message: "Project not found or you are not the owner",
                    });

                case "USER_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "User not found",
                    });

                case "OWNER_CANNOT_BE_COLLABORATOR":
                    return res.status(400).json({
                        success: false,
                        message: "Owner cannot be added as a collaborator",
                    });
            }
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}