"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "@/lib/socket";

export function useFileEvents(projectId: string) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!projectId) return;

        const invalidateFiles = (data: { projectId: string }) => {
            if (data.projectId !== projectId) return;

            queryClient.invalidateQueries({
                queryKey: ["project-files", projectId],
            });
        };

        socket.on("file:created", invalidateFiles);
        socket.on("file:updated", invalidateFiles);
        socket.on("file:deleted", invalidateFiles);

        return () => {
            socket.off("file:created", invalidateFiles);
            socket.off("file:updated", invalidateFiles);
            socket.off("file:deleted", invalidateFiles);
        };
    }, [projectId, queryClient]);
}