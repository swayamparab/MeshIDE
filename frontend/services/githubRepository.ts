import api from "@/lib/api";

export interface GithubRepositoryFile {
    name: string;
    path: string;
    sha: string;
    size?: number;
    url: string;
    html_url?: string;
    git_url?: string;
    download_url?: string | null;
    type: "file" | "dir";
}

interface GithubRepositoryContentsResponse {
    success: boolean;
    contents: GithubRepositoryFile[];
}

export async function getGithubRepositoryContents(
    projectId: string,
    path = "",
): Promise<GithubRepositoryFile[]> {
    const response =
        await api.get<GithubRepositoryContentsResponse>(
            "/api/github/repository/contents",
            {
                params: {
                    projectId,
                    path,
                },
            },
        );

    return response.data.contents;
}