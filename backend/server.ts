import http from "node:http";
import app from "./app.js";
import { setupTerminalWebSocket } from "./modules/terminal/terminal.server.js";
import { setupCollaborationSocket } from "./socket/collaboration.server.js";
import "dotenv/config";

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

setupTerminalWebSocket(server);
setupCollaborationSocket(server);

server.listen(PORT, () => {
    console.log(
        `Mesh backend running on http://localhost:${PORT}`,
    );
});