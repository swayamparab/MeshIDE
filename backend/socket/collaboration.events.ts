import { getIO } from "./collaboration.server.js";

export function emitFileCreated(
    projectId: string,
    file: unknown,
) {
    getIO()
        .to(`project:${projectId}`)
        .emit("file:created", {
            projectId,
            file,
        });
}

export function emitFileUpdated(
    projectId: string,
    file: unknown,
) {
    getIO()
        .to(`project:${projectId}`)
        .emit("file:updated", {
            projectId,
            file,
        });
}

export function emitFileDeleted(
    projectId: string,
    fileId: string,
) {
    getIO()
        .to(`project:${projectId}`)
        .emit("file:deleted", {
            projectId,
            fileId,
        });
}

export function emitFileContentUpdated(
    projectId: string,
    fileId: string,
    content: string,
    userId: string,
) {
    getIO()
        .to(`project:${projectId}`)
        .emit("file:content-updated", {
            projectId,
            fileId,
            content,
            userId,
        });
}