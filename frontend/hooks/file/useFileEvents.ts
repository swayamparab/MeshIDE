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

        const handleContentUpdate = (data: {
            projectId: string;
            fileId: string;
            content: string;
            userId: string;
        }) => {
            if (data.projectId !== projectId) return;

            queryClient.setQueryData(
                ["project-files", projectId],
                (oldData: any) => {
                    if (!oldData) return oldData;

                    // If the cache is an array
                    if (Array.isArray(oldData)) {
                        return oldData.map((file) =>
                            file.id === data.fileId
                                ? { ...file, content: data.content }
                                : file,
                        );
                    }

                    // If the cache is an object containing files
                    if (Array.isArray(oldData.files)) {
                        return {
                            ...oldData,
                            files: oldData.files.map((file: any) =>
                                file.id === data.fileId
                                    ? { ...file, content: data.content }
                                    : file,
                            ),
                        };
                    }

                    return oldData;
                },
            );
        };

        socket.on("file:created", invalidateFiles);
        socket.on("file:updated", invalidateFiles);
        socket.on("file:deleted", invalidateFiles);
        socket.on("file:content-updated", handleContentUpdate);

        return () => {
            socket.off("file:created", invalidateFiles);
            socket.off("file:updated", invalidateFiles);
            socket.off("file:deleted", invalidateFiles);
            socket.off("file:content-updated", handleContentUpdate);
        };
    }, [projectId, queryClient]);
}