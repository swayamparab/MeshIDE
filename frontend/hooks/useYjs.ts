"use client";

import { useEffect, useRef, useState } from "react";
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

interface YjsSession {
    fileId: string;
    doc: Y.Doc;
    text: Y.Text;
    awareness: awarenessProtocol.Awareness;
}

export function useYjs({ projectId, fileId }: UseYjsOptions) {
    const [session, setSession] = useState<YjsSession | null>(null);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);

    const { data: user } = useCurrentUser();
    const userId = user?.user.id;
    const userName = user?.user.username;

    useEffect(() => {
        if (!projectId || !fileId || !userId) {
            return;
        }

        let disposed = false;

        const doc = new Y.Doc();
        const text = doc.getText("monaco");
        const awareness = new awarenessProtocol.Awareness(doc);

        awareness.setLocalStateField("user", {
            id: userId,
            name: userName,
        });

        setSession(null); // never expose the previous file's doc

        const apiUrl =
            process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
        const wsUrl = apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
        const url =
            `${wsUrl}/yjs` +
            `?projectId=${encodeURIComponent(projectId)}` +
            `&fileId=${encodeURIComponent(fileId)}`;

        const socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const send = (encoder: encoding.Encoder) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(encoding.toUint8Array(encoder));
            }
        };

        const sendSyncStep1 = () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeSyncStep1(encoder, doc);
            send(encoder);
        };

        const sendUpdate = (update: Uint8Array) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeUpdate(encoder, update);
            send(encoder);
        };

        const sendAwareness = (clients: number[]) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
            );
            send(encoder);
        };

        const handleAwarenessUpdate = (
            { added, updated, removed }: {
                added: number[];
                updated: number[];
                removed: number[];
            },
            origin: unknown,
        ) => {
            if (origin === socket) return;
            const changed = [...added, ...updated, ...removed];
            if (changed.length) sendAwareness(changed);
        };

        const handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === socket) return;
            sendUpdate(update);
        };

        const handleBeforeUnload = () => {
            awareness.setLocalState(null);
            sendAwareness([awareness.clientID]);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        awareness.on("update", handleAwarenessUpdate);
        doc.on("update", handleLocalUpdate);

        socket.onopen = () => {
            if (disposed) return;
            setConnected(true);
            sendSyncStep1();
            sendAwareness([awareness.clientID]); // announce ourselves
        };

        socket.onmessage = (event) => {
            if (disposed) return;
            if (!(event.data instanceof ArrayBuffer)) return;

            try {
                const decoder = decoding.createDecoder(
                    new Uint8Array(event.data),
                );
                const messageType = decoding.readVarUint(decoder);

                if (messageType === MESSAGE_AWARENESS) {
                    awarenessProtocol.applyAwarenessUpdate(
                        awareness,
                        decoding.readVarUint8Array(decoder),
                        socket,
                    );
                    return;
                }

                if (messageType !== MESSAGE_SYNC) return;

                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_SYNC);

                const syncType = syncProtocol.readSyncMessage(
                    decoder,
                    encoder,
                    doc,
                    socket,
                );

                // Content is only guaranteed to be loaded after SyncStep2
                if (syncType === syncProtocol.messageYjsSyncStep2) {
                    setSession({ fileId, doc, text, awareness });
                }

                if (encoding.length(encoder) > 1) {
                    send(encoder);
                }
            } catch (error) {
                console.error("Yjs sync error:", error);
            }
        };

        socket.onerror = (error) => {
            if (disposed) return;
            console.error("Yjs WebSocket error:", error);
        };

        socket.onclose = () => {
            if (disposed) return; // <-- the key fix: ignore stale sockets
            setConnected(false);
            setSession(null);
        };

        return () => {
            disposed = true;

            window.removeEventListener("beforeunload", handleBeforeUnload);

            awareness.setLocalState(null);
            sendAwareness([awareness.clientID]);

            awareness.off("update", handleAwarenessUpdate);
            doc.off("update", handleLocalUpdate);

            socket.close();
            if (socketRef.current === socket) {
                socketRef.current = null;
            }

            awareness.destroy();
            doc.destroy();

            setSession(null);
            setConnected(false);
        };
    }, [projectId, fileId, userId, userName]);

    const ready = session !== null && session.fileId === fileId;

    const insertTestText = (value: string) => {
        if (!session) return;
        session.text.insert(session.text.length, value);
    };

    return {
        doc: ready ? session.doc : null,
        text: ready ? session.text : null,
        awareness: ready ? session.awareness : null,
        socket: socketRef.current,
        connected,
        synced: ready,
        insertTestText,
    };
}