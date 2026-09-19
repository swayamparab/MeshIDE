import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "../lib/auth/jwt.js";
import { userHasProjectAccess } from "../modules/projects/project.service.js";

let io: Server;

export function setupCollaborationSocket(
    httpServer: HttpServer,
) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL,
            credentials: true,
        },
    });

    io.use((socket, next) => {
        const token = socket.handshake.headers.cookie
            ?.split("; ")
            .find((cookie) =>
                cookie.startsWith("mesh_access_token="),
            )
            ?.split("=")[1];

        if (!token) {
            return next(
                new Error("Authentication required"),
            );
        }

        try {
            const { userId } = verifyAccessToken(token);

            socket.data.userId = userId;

            next();
        } catch {
            next(
                new Error("Invalid or expired token"),
            );
        }
    });

    io.on("connection", (socket) => {
        console.log(
            `Collaboration socket connected: ${socket.id}`,
        );

        socket.on(
            "project:join",
            async (projectId: string) => {
                if (!projectId) return;

                try {
                    const userId = socket.data.userId as string;

                    const hasAccess = await userHasProjectAccess(
                        projectId,
                        userId,
                    );

                    if (!hasAccess) {
                        socket.emit("project:join:error", {
                            message: "You do not have access to this project.",
                        });

                        return;
                    }

                    await socket.join(`project:${projectId}`);

                    console.log(
                        `Socket ${socket.id} joined project:${projectId}`,
                    );
                } catch (error) {
                    console.error(
                        "Project room join failed:",
                        error,
                    );

                    socket.emit("project:join:error", {
                        message: "Unable to join project.",
                    });
                }
            },
        );

        socket.on(
            "project:leave",
            (projectId: string) => {
                if (!projectId) return;

                socket.leave(`project:${projectId}`);

                console.log(
                    `Socket ${socket.id} left project:${projectId}`,
                );
            },
        );

        socket.on("disconnect", () => {
            console.log(
                `Collaboration socket disconnected: ${socket.id}`,
            );
        });
    });

    return io;
}

export function getIO() {
    if (!io) {
        throw new Error("SOCKET_IO_NOT_INITIALIZED");
    }

    return io;
}