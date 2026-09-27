"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { useCurrentUser } from "./useAuth";

interface UseYjsOptions {
    projectId: string;
    fileId: string | null;
}

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export function useYjs({
    projectId,
    fileId,
}: UseYjsOptions) {
    const [connected, setConnected] =
        useState(false);

    const [synced, setSynced] =
        useState(false);

    const doc = useMemo(
        () => new Y.Doc(),
        [projectId, fileId],
    );

    const text = useMemo(
        () => doc.getText("monaco"),
        [doc],
    );

    const awareness = useMemo(
        () =>
            new awarenessProtocol.Awareness(
                doc,
            ),
        [doc],
    );

    const socketRef = useRef<WebSocket | null>(null);

    const { data: user } = useCurrentUser();

    useEffect(() => {
        if (!projectId || !fileId) {
            return;
        }

        if (!user) {
            return;
        }

        awareness.setLocalStateField("user", {
            id: user.user.id,
            name: user.user.username,
        });

        console.log(
            "Local awareness:",
            awareness.getLocalState(),
        );

        setSynced(false);

        const apiUrl =
            process.env.NEXT_PUBLIC_API_URL ??
            "http://localhost:5000";

        const wsUrl = apiUrl
            .replace(/^http/, "ws")
            .replace(/\/$/, "");

        const url =
            `${wsUrl}/yjs` +
            `?projectId=${encodeURIComponent(
                projectId,
            )}` +
            `&fileId=${encodeURIComponent(
                fileId,
            )}`;

        const socket =
            new WebSocket(url);

        socket.binaryType =
            "arraybuffer";

        socketRef.current = socket;

        const sendSyncStep1 = () => {
            if (
                socket.readyState !==
                WebSocket.OPEN
            ) {
                return;
            }

            const encoder =
                encoding.createEncoder();

            encoding.writeVarUint(
                encoder,
                MESSAGE_SYNC,
            );

            syncProtocol.writeSyncStep1(
                encoder,
                doc,
            );

            socket.send(
                encoding.toUint8Array(
                    encoder,
                ),
            );
        };

        const sendUpdate = (
            update: Uint8Array,
        ) => {
            if (
                socket.readyState !==
                WebSocket.OPEN
            ) {
                return;
            }

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

            socket.send(
                encoding.toUint8Array(
                    encoder,
                ),
            );
        };

        const sendAwarenessUpdate = (
            update: Uint8Array,
        ) => {
            if (
                socket.readyState !==
                WebSocket.OPEN
            ) {
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

            socket.send(
                encoding.toUint8Array(
                    encoder,
                ),
            );
        };

        const handleAwarenessUpdate = (
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
        ) => {
            if (origin === socket) {
                return;
            }

            const changedClients = [
                ...added,
                ...updated,
                ...removed,
            ];

            if (changedClients.length === 0) {
                return;
            }

            const update =
                awarenessProtocol.encodeAwarenessUpdate(
                    awareness,
                    changedClients,
                );

            sendAwarenessUpdate(update);
        };

        const handleLocalUpdate = (
            update: Uint8Array,
            origin: unknown,
        ) => {
            if (origin === socket) {
                return;
            }

            // console.log(
            //     "Yjs local update:",
            //     {
            //         length:
            //             update.length,
            //         content:
            //             text.toString(),
            //     },
            // );

            sendUpdate(update);
        };

        awareness.on(
            "update",
            handleAwarenessUpdate,
        );

        doc.on(
            "update",
            handleLocalUpdate,
        );

        socket.onopen = () => {
            // console.log(
            //     "Yjs WebSocket connected",
            // );

            setConnected(true);

            sendSyncStep1();
        };

        socket.onmessage = (
            event,
        ) => {
            if (
                !(event.data instanceof
                    ArrayBuffer)
            ) {
                return;
            }

            try {
                const data =
                    new Uint8Array(
                        event.data,
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
                    MESSAGE_AWARENESS
                ) {
                    const update =
                        decoding.readVarUint8Array(
                            decoder,
                        );

                    awarenessProtocol.applyAwarenessUpdate(
                        awareness,
                        update,
                        socket,
                    );

                    return;
                }

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
                    doc,
                    socket,
                );

                // console.log(
                //     "Yjs message applied:",
                //     text.toString(),
                // );

                /*
                 * The first sync message from the
                 * server populates this client's
                 * Y.Doc with the saved/live state.
                 *
                 * Only after this point should
                 * Monaco bind to Y.Text.
                 */
                if (!synced) {
                    setSynced(true);
                }

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
        };

        socket.onerror = (
            error,
        ) => {
            console.error(
                "Yjs WebSocket error:",
                error,
            );
        };

        socket.onclose = () => {
            // console.log(
            //     "Yjs WebSocket disconnected",
            // );

            setConnected(false);
            setSynced(false);

            if (
                socketRef.current ===
                socket
            ) {
                socketRef.current = null;
            }
        };

        return () => {
            awarenessProtocol.removeAwarenessStates(
                awareness,
                [awareness.clientID],
                socket,
            );

            awareness.off(
                "update",
                handleAwarenessUpdate,
            );

            doc.off(
                "update",
                handleLocalUpdate,
            );

            socket.close();

            if (
                socketRef.current === socket
            ) {
                socketRef.current = null;
            }

            awareness.destroy();
            doc.destroy();

            setConnected(false);
            setSynced(false);
        };

    }, [
        projectId,
        fileId,
        doc,
        text,
        awareness,
        user
    ]);

    const insertTestText = (
        value: string,
    ) => {
        text.insert(
            text.length,
            value,
        );
    };

    return {
        doc,
        text,
        awareness,
        socket: socketRef.current,
        connected,
        synced,
        insertTestText,
    };
}