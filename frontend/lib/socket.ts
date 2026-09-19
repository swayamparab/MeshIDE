import { io } from "socket.io-client";

export const socket = io(
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
    {
        withCredentials: true,
        autoConnect: false,
    },
);