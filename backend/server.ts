import http from "node:http";
import app from "./app.js";
import { setupTerminalWebSocket } from "./modules/terminal/terminal.server.js";
import { setupCollaborationSocket } from "./socket/collaboration.server.js";
import { setupYjsWebSocket } from "./socket/yjs.server.js";
import "dotenv/config";

const PORT =
    Number(process.env.PORT) || 5000;

const server =
    http.createServer(app);

const terminalWss =
    setupTerminalWebSocket(server);

setupCollaborationSocket(server);

const yjsWss =
    setupYjsWebSocket(server);

server.on(
    "upgrade",
    (request, socket, head) => {
        const url = new URL(
            request.url ?? "",
            "http://localhost",
        );

        if (
            url.pathname ===
            "/terminal"
        ) {
            terminalWss.handleUpgrade(
                request,
                socket,
                head,
                (ws) => {
                    terminalWss.emit(
                        "connection",
                        ws,
                        request,
                    );
                },
            );

            return;
        }

        if (
            url.pathname ===
            "/yjs"
        ) {
            yjsWss.handleUpgrade(
                request,
                socket,
                head,
                (ws) => {
                    yjsWss.emit(
                        "connection",
                        ws,
                        request,
                    );
                },
            );

            return;
        }
    },
);

server.listen(PORT, () => {
    console.log(
        `Mesh backend running on http://localhost:${PORT}`,
    );
});