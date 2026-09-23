"use client";

import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import {
    createFile,
    getProjectFiles,
} from "@/services/file";

export function useProjectFiles(projectId: string) {
    return useQuery({
        queryKey: ["project-files", projectId],
        queryFn: () => getProjectFiles(projectId),
        enabled: Boolean(projectId),
    });
}

export function useCreateFile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            projectId,
            name,
            parentId,
            content,
        }: {
            projectId: string;
            name: string;
            parentId?: string | null;
            content?: string;
        }) =>
            createFile(projectId, {
                name,
                type: "file",
                parentId,
                content,
            }),

        onSuccess: (_response, variables) => {
            queryClient.invalidateQueries({
                queryKey: [
                    "project-files",
                    variables.projectId,
                ],
            });
        },
    });
}

export function useCreateFolder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            projectId,
            name,
            parentId,
        }: {
            projectId: string;
            name: string;
            parentId?: string | null;
        }) =>
            createFile(projectId, {
                name,
                type: "folder",
                parentId,
            }),

        onSuccess: (_response, variables) => {
            queryClient.invalidateQueries({
                queryKey: [
                    "project-files",
                    variables.projectId,
                ],
            });
        },
    });
}