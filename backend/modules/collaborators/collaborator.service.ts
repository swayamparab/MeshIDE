import { and, eq, or } from "drizzle-orm";

import { db } from "../../db/index.js";
import { projects } from "../../db/schema/projects.js";
import { users } from "../../db/schema/users.js";
import { projectCollaborators } from "../../db/schema/project-collaborators.js";

export async function addCollaborator(
    projectId: string,
    ownerId: string,
    identifier: string,
) {
    // Verify that the requester owns the project
    const [project] = await db
        .select({
            id: projects.id,
        })
        .from(projects)
        .where(
            and(
                eq(projects.id, projectId),
                eq(projects.ownerId, ownerId),
            ),
        )
        .limit(1);

    if (!project) {
        throw new Error("PROJECT_NOT_FOUND_OR_NOT_OWNER");
    }

    // Find the user by username or email
    const [user] = await db
        .select({
            id: users.id,
            username: users.username,
            email: users.email,
        })
        .from(users)
        .where(
            or(
                eq(users.username, identifier),
                eq(users.email, identifier),
            ),
        )
        .limit(1);

    if (!user) {
        throw new Error("USER_NOT_FOUND");
    }

    // Prevent the owner from adding themselves
    if (user.id === ownerId) {
        throw new Error("OWNER_CANNOT_BE_COLLABORATOR");
    }

    // Add the collaborator
    const [collaborator] = await db
        .insert(projectCollaborators)
        .values({
            projectId,
            userId: user.id,
        })
        .returning({
            id: projectCollaborators.id,
            projectId: projectCollaborators.projectId,
            userId: projectCollaborators.userId,
            createdAt: projectCollaborators.createdAt,
        });

    if (!collaborator) {
        throw new Error("COLLABORATOR_CREATION_FAILED");
    }

    return {
        ...collaborator,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
        },
    };
}