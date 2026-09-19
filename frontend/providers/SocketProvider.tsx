"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import { socket } from "@/lib/socket";

interface SocketContextValue {
    connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
    connected: false,
});

export function SocketProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [connected, setConnected] = useState(
        socket.connected,
    );

    useEffect(() => {
        function handleConnect() {
            setConnected(true);
        }

        function handleDisconnect() {
            setConnected(false);
        }

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);

        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    return useContext(SocketContext);
}