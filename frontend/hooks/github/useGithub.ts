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
        mutationFn: async (projectId: string) => {
            window.location.href =
                `${process.env.NEXT_PUBLIC_API_URL}/api/github/connect?projectId=${encodeURIComponent(projectId)}`;
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