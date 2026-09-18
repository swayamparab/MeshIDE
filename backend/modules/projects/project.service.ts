import { and, eq, exists, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { projects } from "../../db/schema/projects.js";
import { projectCollaborators } from "../../db/schema/project-collaborators.js";

interface CreateProjectInput {
    name: string;
    description?: string | undefined;
}

export async function createProject(userId: string, input: CreateProjectInput) {

    const [project] = await db
        .insert(projects)
        .values({
            ownerId: userId,
            name: input.name,
            description: input.description
        })
        .returning({
            id: projects.id,
            ownerId: projects.ownerId,
            name: projects.name,
            description: projects.description,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
        })

    if (!project) {
        throw new Error("PROJECT_CREATION_FAILED")
    }

    return project;
}

export async function getUserProjects(userId: string) {
    return db
        .select({
            id: projects.id,
            ownerId: projects.ownerId,
            name: projects.name,
            description: projects.description,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(
            or(
                eq(projects.ownerId, userId),
                exists(
                    db
                        .select()
                        .from(projectCollaborators)
                        .where(
                            and(
                                eq(
                                    projectCollaborators.projectId,
                                    projects.id,
                                ),
                                eq(
                                    projectCollaborators.userId,
                                    userId,
                                ),
                            ),
                        ),
                ),
            ),
        );
}

export async function getProjectById(
    projectId: string,
    userId: string,
) {
    const [project] = await db
        .select({
            id: projects.id,
            ownerId: projects.ownerId,
            name: projects.name,
            description: projects.description,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(
            and(
                eq(projects.id, projectId),
                or(
                    eq(projects.ownerId, userId),
                    exists(
                        db
                            .select()
                            .from(projectCollaborators)
                            .where(
                                and(
                                    eq(
                                        projectCollaborators.projectId,
                                        projects.id,
                                    ),
                                    eq(
                                        projectCollaborators.userId,
                                        userId,
                                    ),
                                ),
                            ),
                    ),
                ),
            ),
        )
        .limit(1);

    return project;
}

export async function updateProject(
    projectId: string,
    userId: string,
    input: {
        name?: string | undefined;
        description?: string | undefined;
    },
) {
    const [project] = await db
        .update(projects)
        .set({
            ...input,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(projects.id, projectId),
                eq(projects.ownerId, userId),
            ),
        )
        .returning({
            id: projects.id,
            ownerId: projects.ownerId,
            name: projects.name,
            description: projects.description,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
        });

    return project;
}

export async function deleteProject(
    projectId: string,
    userId: string,
) {
    const [project] = await db
        .delete(projects)
        .where(
            and(
                eq(projects.id, projectId),
                eq(projects.ownerId, userId),
            ),
        )
        .returning({
            id: projects.id,
        });

    return project;
}