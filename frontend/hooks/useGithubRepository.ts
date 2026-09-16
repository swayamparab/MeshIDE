import { useQuery } from "@tanstack/react-query";

import { getGithubRepositoryContents } from "@/services/githubRepository";

export function useGithubRepositoryContents(
    projectId: string,
    path = "",
) {
    return useQuery({
        queryKey: ["github-repository-contents", projectId, path],
        queryFn: () =>
            getGithubRepositoryContents(projectId, path),
        enabled: Boolean(projectId),
    });
}