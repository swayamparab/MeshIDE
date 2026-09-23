"use client";

import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import {
    deleteFile,
    getFile,
    updateFile,
} from "@/services/file";

export function useFile(
    projectId: string,
    fileId: string | null,
) {
    return useQuery({
        queryKey: [
            "file",
            projectId,
            fileId,
        ],
        queryFn: () =>
            getFile(
                projectId,
                fileId!,
            ),
        enabled: Boolean(
            projectId && fileId,
        ),
    });
}

interface UpdateFileVariables {
    projectId: string;
    fileId: string;
    name?: string;
    content?: string;
    parentId?: string | null;
}

export function useUpdateFile() {
    const queryClient =
        useQueryClient();

    return useMutation({
        mutationFn: ({
            projectId,
            fileId,
            name,
            content,
            parentId,
        }: UpdateFileVariables) =>
            updateFile(
                projectId,
                fileId,
                {
                    ...(name !== undefined
                        ? { name }
                        : {}),
                    ...(content !== undefined
                        ? { content }
                        : {}),
                    ...(parentId !== undefined
                        ? { parentId }
                        : {}),
                },
            ),

        onSuccess: (
            response,
            variables,
        ) => {
            queryClient.setQueryData(
                [
                    "file",
                    variables.projectId,
                    variables.fileId,
                ],
                response,
            );

            queryClient.invalidateQueries({
                queryKey: [
                    "project-files",
                    variables.projectId,
                ],
            });
        },
    });
}

export function useDeleteFile() {
    const queryClient =
        useQueryClient();

    return useMutation({
        mutationFn: ({
            projectId,
            fileId,
        }: {
            projectId: string;
            fileId: string;
        }) =>
            deleteFile(
                projectId,
                fileId,
            ),

        onSuccess: (
            _response,
            variables,
        ) => {
            queryClient.removeQueries({
                queryKey: [
                    "file",
                    variables.projectId,
                    variables.fileId,
                ],
            });

            queryClient.invalidateQueries({
                queryKey: [
                    "project-files",
                    variables.projectId,
                ],
            });
        },
    });
}