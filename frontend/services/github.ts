import api from "@/lib/api";

export interface GithubConnection {
    id: string;
    projectId: string;
    githubUserId: number;
    githubUsername: string;
    installationId: number;
    repositoryOwner: string;
    repositoryName: string;
    repositoryUrl: string;
    createdAt: string;
    updatedAt: string;
}

interface GithubConnectResponse {
    success: boolean;
    url: string;
}

interface GithubConnectionResponse {
    success: boolean;
    connection: GithubConnection | null;
}

interface GithubDisconnectResponse {
    success: boolean;
    message: string;
}

export async function getGithubConnectUrl(
    projectId: string,
): Promise<string> {
    const response =
        await api.get<GithubConnectResponse>("/api/github/connect",
            {
                params: { projectId },
            }
        );

    return response.data.url;
}

export async function getGithubConnection(
    projectId: string,
): Promise<GithubConnection | null> {
    const response =
        await api.get<GithubConnectionResponse>("/api/github/connection",
            {
                params: { projectId },
            }
        );

    return response.data.connection;
}

export async function disconnectGithub(
    projectId: string,
): Promise<GithubDisconnectResponse> {
    const response =
        await api.delete<GithubDisconnectResponse>("/api/github/connection",
            {
                params: { projectId },
            }
        );

    return response.data;
}