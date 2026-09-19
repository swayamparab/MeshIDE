import {
    and,
    eq,
    exists,
    isNull,
    ne,
    or
} from "drizzle-orm";

import { db } from "../../db/index.js";
import {
    projectCollaborators,
    projectFiles,
    projects,
} from "../../db/schema/index.js";
import { emitFileCreated, emitFileDeleted, emitFileUpdated } from "../../socket/collaboration.events.js";

interface CreateFileInput {
    name: string;
    type: "file" | "folder";
    parentId?: string | null | undefined;
    content?: string | undefined;
}

interface UpdateFileInput {
    name?: string | undefined;
    content?: string | undefined;
    parentId?: string | null | undefined;
}

async function verifyProjectAccess(
    projectId: string,
    userId: string,
) {
    const [project] = await db
        .select({
            id: projects.id,
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

async function verifyParentFolder(
    projectId: string,
    parentId: string,
) {
    const [parent] = await db
        .select({
            id: projectFiles.id,
            type: projectFiles.type,
        })
        .from(projectFiles)
        .where(
            and(
                eq(projectFiles.id, parentId),
                eq(
                    projectFiles.projectId,
                    projectId,
                ),
            ),
        )
        .limit(1);

    if (!parent) {
        throw new Error("PARENT_NOT_FOUND");
    }

    if (parent.type !== "folder") {
        throw new Error("PARENT_NOT_FOLDER");
    }

    return parent;
}

async function isDescendant(
    projectId: string,
    fileId: string,
    possibleParentId: string,
) {
    let currentId: string | null =
        possibleParentId;

    while (currentId) {
        if (currentId === fileId) {
            return true;
        }

        const [current] = await db
            .select({
                parentId:
                    projectFiles.parentId,
            })
            .from(projectFiles)
            .where(
                and(
                    eq(
                        projectFiles.id,
                        currentId,
                    ),
                    eq(
                        projectFiles.projectId,
                        projectId,
                    ),
                ),
            )
            .limit(1);

        if (!current) {
            break;
        }

        currentId = current.parentId;
    }

    return false;
}

/*
 * Checks whether another file/folder with the
 * same name already exists in the same location.
 *
 * Root level:
 *     parentId IS NULL
 *
 * Nested:
 *     parentId = folderId
 */
async function checkDuplicateName(
    projectId: string,
    parentId: string | null,
    name: string,
    excludeFileId?: string,
) {
    const conditions = [
        eq(
            projectFiles.projectId,
            projectId,
        ),
        eq(
            projectFiles.name,
            name,
        ),
    ];

    if (parentId === null) {
        conditions.push(
            isNull(
                projectFiles.parentId,
            ),
        );
    } else {
        conditions.push(
            eq(
                projectFiles.parentId,
                parentId,
            ),
        );
    }

    if (excludeFileId) {
        conditions.push(
            ne(
                projectFiles.id,
                excludeFileId,
            ),
        );
    }

    const query = db
        .select({
            id: projectFiles.id,
        })
        .from(projectFiles)
        .where(
            and(...conditions),
        );

    const results =
        await query.limit(1);

    if (
        results.length > 0 &&
        results[0]
    ) {
        if (
            excludeFileId &&
            results[0].id ===
            excludeFileId
        ) {
            return false;
        }

        return true;
    }

    return false;
}

export async function createFile(
    projectId: string,
    userId: string,
    input: CreateFileInput,
) {
    const project =
        await verifyProjectAccess(
            projectId,
            userId,
        );

    if (!project) {
        throw new Error(
            "PROJECT_NOT_FOUND",
        );
    }

    const parentId =
        input.parentId ?? null;

    if (parentId !== null) {
        await verifyParentFolder(
            projectId,
            parentId,
        );
    }

    /*
     * Explicit duplicate validation.
     *
     * This works for both:
     *
     * root:
     * parentId = NULL
     *
     * folder:
     * parentId = folder ID
     */
    const duplicate =
        await checkDuplicateName(
            projectId,
            parentId,
            input.name,
        );

    if (duplicate) {
        throw new Error(
            "FILE_NAME_EXISTS",
        );
    }

    const content =
        input.type === "file"
            ? input.content ?? ""
            : null;

    try {
        const [file] =
            await db
                .insert(projectFiles)
                .values({
                    projectId,
                    parentId,
                    name: input.name,
                    type: input.type,
                    content,
                })
                .returning({
                    id: projectFiles.id,
                    projectId:
                        projectFiles.projectId,
                    parentId:
                        projectFiles.parentId,
                    name:
                        projectFiles.name,
                    type:
                        projectFiles.type,
                    content:
                        projectFiles.content,
                    createdAt:
                        projectFiles.createdAt,
                    updatedAt:
                        projectFiles.updatedAt,
                });

        if (!file) {
            throw new Error(
                "FILE_CREATION_FAILED",
            );
        }

        emitFileCreated(projectId, file);

        return file;
    } catch (error) {
        /*
         * Keep the database constraint as the
         * final protection against race conditions.
         */
        if (
            error instanceof Error &&
            error.message.includes(
                "project_files_project_parent_name_unique",
            )
        ) {
            throw new Error(
                "FILE_NAME_EXISTS",
            );
        }

        throw error;
    }
}

export async function getProjectFiles(
    projectId: string,
    userId: string,
) {
    const project =
        await verifyProjectAccess(
            projectId,
            userId,
        );

    if (!project) {
        throw new Error(
            "PROJECT_NOT_FOUND",
        );
    }

    return db
        .select({
            id: projectFiles.id,
            projectId:
                projectFiles.projectId,
            parentId:
                projectFiles.parentId,
            name:
                projectFiles.name,
            type:
                projectFiles.type,
            content:
                projectFiles.content,
            createdAt:
                projectFiles.createdAt,
            updatedAt:
                projectFiles.updatedAt,
        })
        .from(projectFiles)
        .where(
            eq(
                projectFiles.projectId,
                projectId,
            ),
        );
}

export async function getFile(
    projectId: string,
    userId: string,
    fileId: string,
) {
    const project =
        await verifyProjectAccess(
            projectId,
            userId,
        );

    if (!project) {
        throw new Error(
            "PROJECT_NOT_FOUND",
        );
    }

    const [file] =
        await db
            .select({
                id: projectFiles.id,
                projectId:
                    projectFiles.projectId,
                parentId:
                    projectFiles.parentId,
                name:
                    projectFiles.name,
                type:
                    projectFiles.type,
                content:
                    projectFiles.content,
                createdAt:
                    projectFiles.createdAt,
                updatedAt:
                    projectFiles.updatedAt,
            })
            .from(projectFiles)
            .where(
                and(
                    eq(
                        projectFiles.id,
                        fileId,
                    ),
                    eq(
                        projectFiles.projectId,
                        projectId,
                    ),
                ),
            )
            .limit(1);

    return file;
}

export async function updateFile(
    projectId: string,
    userId: string,
    fileId: string,
    input: UpdateFileInput,
) {
    const project =
        await verifyProjectAccess(
            projectId,
            userId,
        );

    if (!project) {
        throw new Error(
            "PROJECT_NOT_FOUND",
        );
    }

    const [existingFile] =
        await db
            .select({
                id: projectFiles.id,
                name:
                    projectFiles.name,
                parentId:
                    projectFiles.parentId,
                type:
                    projectFiles.type,
            })
            .from(projectFiles)
            .where(
                and(
                    eq(
                        projectFiles.id,
                        fileId,
                    ),
                    eq(
                        projectFiles.projectId,
                        projectId,
                    ),
                ),
            )
            .limit(1);

    if (!existingFile) {
        throw new Error(
            "FILE_NOT_FOUND",
        );
    }

    const destinationParentId =
        input.parentId !==
            undefined
            ? input.parentId
            : existingFile.parentId;

    if (
        destinationParentId !==
        null
    ) {
        if (
            destinationParentId ===
            fileId
        ) {
            throw new Error(
                "INVALID_PARENT",
            );
        }

        await verifyParentFolder(
            projectId,
            destinationParentId,
        );

        if (
            existingFile.type ===
            "folder" &&
            await isDescendant(
                projectId,
                fileId,
                destinationParentId,
            )
        ) {
            throw new Error(
                "INVALID_PARENT",
            );
        }
    }

    const destinationName =
        input.name !== undefined
            ? input.name
            : existingFile.name;

    /*
     * Check duplicate name when either:
     *
     * - the name changes
     * - the parent changes
     *
     * We exclude the current file.
     */
    const nameChanged =
        input.name !== undefined &&
        input.name !==
        existingFile.name;

    const parentChanged =
        input.parentId !==
        undefined &&
        input.parentId !==
        existingFile.parentId;

    if (
        nameChanged ||
        parentChanged
    ) {
        const duplicate =
            await checkDuplicateName(
                projectId,
                destinationParentId,
                destinationName,
                fileId,
            );

        if (duplicate) {
            throw new Error(
                "FILE_NAME_EXISTS",
            );
        }
    }

    const updateData: {
        name?: string;
        content?: string | null;
        parentId?: string | null;
        updatedAt: Date;
    } = {
        updatedAt: new Date(),
    };

    if (
        input.name !==
        undefined
    ) {
        updateData.name =
            input.name;
    }

    if (
        existingFile.type ===
        "file"
    ) {
        if (
            input.content !==
            undefined
        ) {
            updateData.content =
                input.content;
        }
    }

    if (
        input.parentId !==
        undefined
    ) {
        updateData.parentId =
            input.parentId;
    }

    try {
        const [updatedFile] =
            await db
                .update(
                    projectFiles,
                )
                .set(updateData)
                .where(
                    and(
                        eq(
                            projectFiles.id,
                            fileId,
                        ),
                        eq(
                            projectFiles.projectId,
                            projectId,
                        ),
                    ),
                )
                .returning({
                    id:
                        projectFiles.id,
                    projectId:
                        projectFiles.projectId,
                    parentId:
                        projectFiles.parentId,
                    name:
                        projectFiles.name,
                    type:
                        projectFiles.type,
                    content:
                        projectFiles.content,
                    createdAt:
                        projectFiles.createdAt,
                    updatedAt:
                        projectFiles.updatedAt,
                });

        if (!updatedFile) {
            throw new Error(
                "FILE_UPDATE_FAILED",
            );
        }

        emitFileUpdated(projectId, updateFile);

        return updatedFile;
    } catch (error) {
        /*
         * Database constraint remains the final
         * protection against concurrent requests.
         */
        if (
            error instanceof Error &&
            error.message.includes(
                "project_files_project_parent_name_unique",
            )
        ) {
            throw new Error(
                "FILE_NAME_EXISTS",
            );
        }

        throw error;
    }
}

export async function deleteFile(
    projectId: string,
    userId: string,
    fileId: string,
) {
    const project =
        await verifyProjectAccess(
            projectId,
            userId,
        );

    if (!project) {
        throw new Error(
            "PROJECT_NOT_FOUND",
        );
    }

    const [file] =
        await db
            .select({
                id:
                    projectFiles.id,
                name:
                    projectFiles.name,
                type:
                    projectFiles.type,
            })
            .from(projectFiles)
            .where(
                and(
                    eq(
                        projectFiles.id,
                        fileId,
                    ),
                    eq(
                        projectFiles.projectId,
                        projectId,
                    ),
                ),
            )
            .limit(1);

    if (!file) {
        throw new Error(
            "FILE_NOT_FOUND",
        );
    }

    async function deleteRecursive(
        currentFileId: string,
    ) {
        const children =
            await db
                .select({
                    id:
                        projectFiles.id,
                })
                .from(
                    projectFiles,
                )
                .where(
                    and(
                        eq(
                            projectFiles.projectId,
                            projectId,
                        ),
                        eq(
                            projectFiles.parentId,
                            currentFileId,
                        ),
                    ),
                );

        for (
            const child of children
        ) {
            await deleteRecursive(
                child.id,
            );
        }

        await db
            .delete(
                projectFiles,
            )
            .where(
                and(
                    eq(
                        projectFiles.id,
                        currentFileId,
                    ),
                    eq(
                        projectFiles.projectId,
                        projectId,
                    ),
                ),
            );
    }

    await deleteRecursive(
        fileId,
    );

    emitFileDeleted(projectId, fileId);

    return file;
}