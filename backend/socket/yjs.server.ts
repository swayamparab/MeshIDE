import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";

import {
    WebSocket,
    WebSocketServer,
} from "ws";

import * as Y from "yjs";

import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

import { verifyAccessToken } from "../lib/auth/jwt.js";
import { getFile } from "../modules/files/file.service.js";

interface YjsDocument {
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    clients: Set<WebSocket>;
}

const documents = new Map<
    string,
    YjsDocument
>();

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

function getCookie(
    request: IncomingMessage,
    name: string,
) {
    const cookieHeader =
        request.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader
            .split(";")
            .map((cookie) =>
                cookie.trim(),
            );

    const target =
        cookies.find(
            (cookie) =>
                cookie.startsWith(
                    `${name}=`,
                ),
        );

    if (!target) {
        return null;
    }

    return decodeURIComponent(
        target.substring(
            name.length + 1,
        ),
    );
}

function authenticateWebSocket(
    request: IncomingMessage,
) {
    const token = getCookie(
        request,
        "mesh_access_token",
    );

    if (!token) {
        return null;
    }

    try {
        return verifyAccessToken(
            token,
        );
    } catch {
        return null;
    }
}

export function setupYjsWebSocket(
    _server: HttpServer,
) {
    const wss =
        new WebSocketServer({
            noServer: true,
        });

    wss.on(
        "connection",
        (socket, request) => {
            const user =
                authenticateWebSocket(
                    request,
                );

            if (!user) {
                socket.close(
                    1008,
                    "Unauthorized",
                );

                return;
            }

            const url = new URL(
                request.url ?? "",
                "http://localhost",
            );

            const projectId =
                url.searchParams.get(
                    "projectId",
                );

            const fileId =
                url.searchParams.get(
                    "fileId",
                );

            if (
                !projectId ||
                !fileId
            ) {
                socket.close(
                    1008,
                    "Missing projectId or fileId",
                );

                return;
            }

            const documentKey =
                `${projectId}:${fileId}`;

            /*
             * The document initialization is async
             * because we have to load the saved
             * content from PostgreSQL.
             */
            let yjsDocument:
                | YjsDocument
                | undefined;

            let initialized = false;

            /*
             * Messages can arrive before the DB
             * initialization finishes.
             *
             * We store them temporarily instead
             * of losing them.
             */
            const pendingMessages:
                | Array<
                    Buffer | ArrayBuffer | Buffer[]
                >
                = [];

            /*
             * Register the message listener IMMEDIATELY.
             *
             * This is important because the frontend
             * sends SyncStep1 as soon as the WebSocket
             * opens.
             */
            socket.on(
                "message",
                async (rawMessage) => {
                    if (!initialized) {
                        pendingMessages.push(
                            rawMessage,
                        );

                        return;
                    }

                    try {
                        const data =
                            rawMessage instanceof Buffer
                                ? new Uint8Array(
                                    rawMessage,
                                )
                                : new Uint8Array(
                                    rawMessage as ArrayBuffer,
                                );

                        const decoder =
                            decoding.createDecoder(
                                data,
                            );

                        const messageType =
                            decoding.readVarUint(
                                decoder,
                            );

                        if (
                            messageType ===
                            MESSAGE_SYNC
                        ) {
                            await handleSyncMessage(
                                rawMessage,
                            );

                            return;
                        }

                        if (
                            messageType ===
                            MESSAGE_AWARENESS
                        ) {
                            handleAwarenessMessage(
                                rawMessage,
                            );
                        }
                    } catch (error) {
                        console.error(
                            "Yjs message handling error:",
                            error,
                        );
                    }
                },
            );

            async function handleSyncMessage(
                rawMessage:
                    | Buffer
                    | ArrayBuffer
                    | Buffer[],
            ) {
                if (!yjsDocument) {
                    return;
                }

                try {
                    const data =
                        rawMessage instanceof
                            Buffer
                            ? new Uint8Array(
                                rawMessage,
                            )
                            : new Uint8Array(
                                rawMessage as ArrayBuffer,
                            );

                    const decoder =
                        decoding.createDecoder(
                            data,
                        );

                    const messageType =
                        decoding.readVarUint(
                            decoder,
                        );

                    if (
                        messageType !==
                        MESSAGE_SYNC
                    ) {
                        return;
                    }

                    const encoder =
                        encoding.createEncoder();

                    encoding.writeVarUint(
                        encoder,
                        MESSAGE_SYNC,
                    );

                    syncProtocol.readSyncMessage(
                        decoder,
                        encoder,
                        yjsDocument.doc,
                        socket,
                    );

                    // console.log(
                    //     "Yjs sync response:",
                    //     {
                    //         documentKey,
                    //         encoderLength:
                    //             encoding.length(
                    //                 encoder,
                    //             ),
                    //         text:
                    //             yjsDocument.doc
                    //                 .getText(
                    //                     "monaco",
                    //                 )
                    //                 .toString(),
                    //     },
                    // );

                    if (
                        encoding.length(
                            encoder,
                        ) > 1 &&
                        socket.readyState ===
                        WebSocket.OPEN
                    ) {
                        socket.send(
                            encoding.toUint8Array(
                                encoder,
                            ),
                        );
                    }
                } catch (error) {
                    console.error(
                        "Yjs sync error:",
                        error,
                    );
                }
            }

            function handleAwarenessMessage(
                rawMessage:
                    | Buffer
                    | ArrayBuffer
                    | Buffer[],
            ) {
                if (!yjsDocument) {
                    return;
                }

                try {
                    const data =
                        rawMessage instanceof Buffer
                            ? new Uint8Array(rawMessage)
                            : new Uint8Array(
                                rawMessage as ArrayBuffer,
                            );

                    const decoder =
                        decoding.createDecoder(data);

                    const messageType =
                        decoding.readVarUint(decoder);

                    if (
                        messageType !==
                        MESSAGE_AWARENESS
                    ) {
                        return;
                    }

                    const update =
                        decoding.readVarUint8Array(
                            decoder,
                        );

                    awarenessProtocol.applyAwarenessUpdate(
                        yjsDocument.awareness,
                        update,
                        socket,
                    );
                } catch (error) {
                    console.error(
                        "Yjs awareness error:",
                        error,
                    );
                }
            }

            function broadcastAwarenessUpdate(
                update: Uint8Array,
                origin: WebSocket,
            ) {
                if (!yjsDocument) {
                    return;
                }

                const encoder =
                    encoding.createEncoder();

                encoding.writeVarUint(
                    encoder,
                    MESSAGE_AWARENESS,
                );

                encoding.writeVarUint8Array(
                    encoder,
                    update,
                );

                const message =
                    encoding.toUint8Array(
                        encoder,
                    );

                for (
                    const client of
                    yjsDocument.clients
                ) {
                    if (client === origin) {
                        continue;
                    }

                    if (
                        client.readyState !==
                        WebSocket.OPEN
                    ) {
                        continue;
                    }

                    client.send(message);
                }
            }

            function handleAwarenessUpdate(
                {
                    added,
                    updated,
                    removed,
                }: {
                    added: number[];
                    updated: number[];
                    removed: number[];
                },
                origin: unknown,
            ) {
                if (
                    !yjsDocument ||
                    !(origin instanceof WebSocket)
                ) {
                    return;
                }

                const changedClients = [
                    ...added,
                    ...updated,
                    ...removed,
                ];

                if (
                    changedClients.length === 0
                ) {
                    return;
                }

                const update =
                    awarenessProtocol.encodeAwarenessUpdate(
                        yjsDocument.awareness,
                        changedClients,
                    );

                broadcastAwarenessUpdate(
                    update,
                    origin,
                );
            }

            /*
             * Initialize the document asynchronously.
             */
            void (async () => {
                try {
                    const file =
                        await getFile(
                            projectId,
                            user.userId,
                            fileId,
                        );

                    // console.log(
                    //     "Yjs DB file loaded:",
                    //     {
                    //         fileId,
                    //         type:
                    //             file?.type,
                    //         contentLength:
                    //             file?.content
                    //                 ?.length ?? 0,
                    //         content:
                    //             file?.content,
                    //     },
                    // );

                    if (!file) {
                        socket.close(
                            1008,
                            "File not found",
                        );

                        return;
                    }

                    /*
                     * Check again after the async
                     * operation in case the client
                     * disconnected while waiting.
                     */
                    if (
                        socket.readyState !==
                        WebSocket.OPEN
                    ) {
                        return;
                    }

                    /*
                     * Another client may have created
                     * the document while this client
                     * was waiting for the DB query.
                     *
                     * If it already exists, reuse it.
                     */
                    yjsDocument =
                        documents.get(
                            documentKey,
                        );

                    if (!yjsDocument) {
                        const doc = new Y.Doc();

                        const awareness = new awarenessProtocol.Awareness(
                            doc,
                        );

                        const text = doc.getText(
                            "monaco",
                        );

                        /*
                         * Load PostgreSQL's saved
                         * version only when creating
                         * the first Y.Doc.
                         */
                        if (
                            file.content
                        ) {
                            text.insert(
                                0,
                                file.content,
                            );
                        }

                        yjsDocument = {
                            doc,
                            awareness,
                            clients:
                                new Set(),
                        };

                        yjsDocument.awareness.on(
                            "update",
                            handleAwarenessUpdate,
                        );

                        documents.set(
                            documentKey,
                            yjsDocument,
                        );

                        doc.on(
                            "update",
                            (
                                update,
                                origin,
                            ) => {
                                const encoder =
                                    encoding.createEncoder();

                                encoding.writeVarUint(
                                    encoder,
                                    MESSAGE_SYNC,
                                );

                                syncProtocol.writeUpdate(
                                    encoder,
                                    update,
                                );

                                const message =
                                    encoding.toUint8Array(
                                        encoder,
                                    );

                                for (
                                    const client of
                                    yjsDocument!
                                        .clients
                                ) {
                                    if (
                                        client ===
                                        origin
                                    ) {
                                        continue;
                                    }

                                    if (
                                        client.readyState !==
                                        WebSocket.OPEN
                                    ) {
                                        continue;
                                    }

                                    client.send(
                                        message,
                                    );
                                }
                            },
                        );

                        // console.log(
                        //     "Yjs document created from DB:",
                        //     documentKey,
                        // );
                    }

                    yjsDocument.clients.add(
                        socket,
                    );

                    // Send the current awareness state
                    // to the newly connected client.
                    const awarenessStates =
                        Array.from(
                            yjsDocument.awareness.getStates().keys(),
                        );

                    if (
                        awarenessStates.length > 0 &&
                        socket.readyState ===
                        WebSocket.OPEN
                    ) {
                        const update =
                            awarenessProtocol.encodeAwarenessUpdate(
                                yjsDocument.awareness,
                                awarenessStates,
                            );

                        const encoder =
                            encoding.createEncoder();

                        encoding.writeVarUint(
                            encoder,
                            MESSAGE_AWARENESS,
                        );

                        encoding.writeVarUint8Array(
                            encoder,
                            update,
                        );

                        socket.send(
                            encoding.toUint8Array(
                                encoder,
                            ),
                        );
                    }

                    initialized = true;

                    // console.log(
                    //     "Yjs client connected:",
                    //     {
                    //         documentKey,
                    //         clients:
                    //             yjsDocument
                    //                 .clients
                    //                 .size,
                    //         userId:
                    //             user.userId,
                    //     },
                    // );

                    /*
                     * Process every message that arrived
                     * while getFile() was running.
                     */
                    for (const message of pendingMessages) {
                        const data =
                            message instanceof Buffer
                                ? new Uint8Array(message)
                                : new Uint8Array(
                                    message as ArrayBuffer,
                                );

                        const decoder =
                            decoding.createDecoder(data);

                        const messageType =
                            decoding.readVarUint(decoder);

                        if (messageType === MESSAGE_SYNC) {
                            await handleSyncMessage(message);
                            continue;
                        }

                        if (messageType === MESSAGE_AWARENESS) {
                            handleAwarenessMessage(message);
                        }
                    }

                    pendingMessages.length = 0;
                } catch (error) {
                    console.error(
                        "Yjs initialization error:",
                        error,
                    );

                    socket.close(
                        1011,
                        "Yjs initialization failed",
                    );
                }
            })();

            socket.on(
                "close",
                () => {
                    yjsDocument?.clients.delete(
                        socket,
                    );

                    // console.log(
                    //     "Yjs client disconnected:",
                    //     {
                    //         documentKey,
                    //         clients:
                    //             yjsDocument
                    //                 ?.clients
                    //                 .size ?? 0,
                    //     },
                    // );

                    if (
                        yjsDocument &&
                        yjsDocument.clients.size === 0
                    ) {
                        yjsDocument.awareness.off(
                            "update",
                            handleAwarenessUpdate,
                        );

                        yjsDocument.doc.destroy();

                        documents.delete(documentKey);
                    }
                },
            );

            socket.on(
                "error",
                (error) => {
                    console.error(
                        "Yjs WebSocket error:",
                        error,
                    );
                },
            );
        },
    );

    console.log(
        "Yjs WebSocket server initialized",
    );

    return wss;
}