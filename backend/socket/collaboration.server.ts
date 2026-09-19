import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

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

    io.on("connection", (socket) => {
        console.log(
            `Collaboration socket connected: ${socket.id}`,
        );

        socket.on(
            "project:join",
            (projectId: string) => {
                if (!projectId) return;

                socket.join(`project:${projectId}`);

                console.log(
                    `Socket ${socket.id} joined project:${projectId}`,
                );
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