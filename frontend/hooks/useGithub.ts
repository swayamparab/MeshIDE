import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import {
    disconnectGithub,
    getGithubConnectUrl,
    getGithubConnection,
} from "@/services/github";

export function useGithubConnection(projectId: string) {
    return useQuery({
        queryKey: ["github-connection", projectId],
        queryFn: () => getGithubConnection(projectId),
        enabled: Boolean(projectId),
    });
}

export function useGithubConnect() {
    return useMutation({
        mutationFn: (projectId: string) =>
            getGithubConnectUrl(projectId),
        onSuccess: (url) => {
            window.location.href = url;
        },
    });
}

export function useGithubDisconnect() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (projectId: string) =>
            disconnectGithub(projectId),
        onSuccess: (_, projectId) => {
            queryClient.setQueryData(
                ["github-connection", projectId],
                null,
            );

            queryClient.invalidateQueries({
                queryKey: ["github-connection", projectId],
            });
        },
    });
}