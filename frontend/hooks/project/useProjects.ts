"use client";

import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import {
    createProject,
    deleteProject,
    getProject,
    getProjects,
    updateProject,
} from "@/services/project";

export function useProjects() {
    return useQuery({
        queryKey: ["projects"],
        queryFn: getProjects,
    });
}

export function useProject(projectId: string) {
    return useQuery({
        queryKey: ["project", projectId],
        queryFn: () => getProject(projectId),
        enabled: Boolean(projectId),
    });
}

export function useCreateProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createProject,

        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["projects"],
            });
        },
    });
}

export function useUpdateProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            projectId,
            data,
        }: {
            projectId: string;
            data: {
                name?: string;
                description?: string;
            };
        }) =>
            updateProject(projectId, data),

        onSuccess: (_response, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["projects"],
            });

            queryClient.invalidateQueries({
                queryKey: ["project", variables.projectId],
            });
        },
    });
}

export function useDeleteProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteProject,

        onSuccess: (_response, projectId) => {
            queryClient.invalidateQueries({
                queryKey: ["projects"],
            });

            queryClient.removeQueries({
                queryKey: ["project", projectId],
            });
        },
    });
}