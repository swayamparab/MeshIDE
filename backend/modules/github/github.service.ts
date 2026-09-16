import crypto from "node:crypto";

import jwt from "jsonwebtoken";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_OAUTH_URL =
    "https://github.com/login/oauth/access_token";

const STATE_EXPIRY = "10m";

interface GithubStatePayload {
    userId: string;
    projectId: string;
    nonce: string;
    purpose: "github-connect";
}

interface GithubTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    token_type?: string;
    error?: string;
    error_description?: string;
}

interface GithubUser {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
}

interface GithubInstallation {
    id: number;
    account: {
        login: string;
        id: number;
        type: "User" | "Organization";
    };
    repository_selection:
        | "all"
        | "selected";
}

interface GithubInstallationsResponse {
    total_count: number;
    installations: GithubInstallation[];
}

interface GithubRepository {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    owner: {
        login: string;
        id: number;
    };
}

interface GithubInstallationRepositoriesResponse {
    total_count: number;
    repositories: GithubRepository[];
}

interface GithubContentItem {
    name: string;
    path: string;
    sha: string;
    size?: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string | null;
    type: "file" | "dir";
}

function getRequiredEnv(
    name: string,
): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured.`,
        );
    }

    return value;
}

export function createGithubState(
    userId: string,
    projectId: string,
) {
    const nonce =
        crypto.randomBytes(32).toString("hex");

    const secret =
        getRequiredEnv("JWT_SECRET");

    const state = jwt.sign(
        {
            userId,
            projectId,
            nonce,
            purpose: "github-connect",
        } satisfies GithubStatePayload,
        secret,
        {
            expiresIn: STATE_EXPIRY,
        },
    );

    return {
        state,
        nonce,
    };
}

export function verifyGithubState(
    state: string,
) {
    const secret =
        getRequiredEnv("JWT_SECRET");

    const decoded =
        jwt.verify(
            state,
            secret,
        );

    if (
        typeof decoded !== "object" ||
        decoded === null ||
        typeof decoded.userId !== "string" ||
        typeof decoded.projectId !== "string" ||
        typeof decoded.nonce !== "string" ||
        decoded.purpose !== "github-connect"
    ) {
        throw new Error(
            "Invalid GitHub OAuth state.",
        );
    }

    return decoded as GithubStatePayload;
}

export function getGithubInstallUrl(
    state: string,
) {
    const appSlug =
        getRequiredEnv(
            "GITHUB_APP_SLUG",
        );

    const url = new URL(
        `https://github.com/apps/${appSlug}/installations/new`,
    );

    url.searchParams.set(
        "state",
        state,
    );

    return url.toString();
}

export async function exchangeGithubCode(
    code: string,
) {
    const clientId =
        getRequiredEnv(
            "GITHUB_CLIENT_ID",
        );

    const clientSecret =
        getRequiredEnv(
            "GITHUB_CLIENT_SECRET",
        );

    const callbackUrl =
        getRequiredEnv(
            "GITHUB_CALLBACK_URL",
        );

    const response =
        await fetch(
            GITHUB_OAUTH_URL,
            {
                method: "POST",
                headers: {
                    Accept:
                        "application/json",
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify({
                    client_id:
                        clientId,
                    client_secret:
                        clientSecret,
                    code,
                    redirect_uri:
                        callbackUrl,
                }),
            },
        );

    const data =
        (await response.json()) as GithubTokenResponse;

    if (
        !response.ok ||
        !data.access_token
    ) {
        throw new Error(
            data.error_description ??
                data.error ??
                "Failed to exchange GitHub authorization code.",
        );
    }

    return data;
}

async function githubRequest<T>(
    accessToken: string,
    endpoint: string,
): Promise<T> {
    const response =
        await fetch(
            `${GITHUB_API_URL}${endpoint}`,
            {
                headers: {
                    Accept:
                        "application/vnd.github+json",
                    Authorization:
                        `Bearer ${accessToken}`,
                    "X-GitHub-Api-Version":
                        "2026-03-10",
                },
            },
        );

    const data =
        (await response.json()) as T & {
            message?: string;
        };

    if (!response.ok) {
        throw new Error(
            data.message ??
                `GitHub API request failed with status ${response.status}.`,
        );
    }

    return data;
}

export function getGithubUser(
    accessToken: string,
) {
    return githubRequest<GithubUser>(
        accessToken,
        "/user",
    );
}

export function getGithubInstallations(
    accessToken: string,
) {
    return githubRequest<GithubInstallationsResponse>(
        accessToken,
        "/user/installations",
    );
}

export function getGithubInstallationRepositories(
    accessToken: string,
    installationId: number,
) {
    return githubRequest<GithubInstallationRepositoriesResponse>(
        accessToken,
        `/user/installations/${installationId}/repositories`,
    );
}

export function getGithubRepositoryContents(
    accessToken: string,
    owner: string,
    repository: string,
    path = "",
) {
    const encodedPath = path
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");

    const endpoint =
        `/repos/${encodeURIComponent(owner)}` +
        `/${encodeURIComponent(repository)}` +
        `/contents/${encodedPath}`;

    return githubRequest<
        GithubContentItem | GithubContentItem[]
    >(
        accessToken,
        endpoint,
    );
}