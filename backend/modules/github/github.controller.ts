import type {
    Request,
    Response,
} from "express";

import {
    createGithubState,
    exchangeGithubCode,
    getGithubInstallUrl,
    getGithubInstallations,
    getGithubInstallationRepositories,
    getGithubUser,
    verifyGithubState,
    getGithubRepositoryContents,
} from "./github.service.js";

import {
    createGithubConnection,
    deleteGithubConnection,
    getGithubConnectionByProject,
    getGithubCredentialsByProject,
} from "./github.repository.js";

import { getProjectById } from "../projects/project.service.js";

const STATE_COOKIE =
    "mesh_github_oauth_state";

export async function connectGithubController(
    req: Request,
    res: Response,
) {
    const userId = req.userId;

    const projectId =
        typeof req.query.projectId === "string"
            ? req.query.projectId
            : null;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized.",
        });
    }

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: "projectId is required.",
        });
    }

    const project = await getProjectById(
        projectId,
        userId,
    );

    if (!project) {
        return res.status(404).json({
            success: false,
            message: "Project not found.",
        });
    }

    try {
        const { state, nonce } =
            createGithubState(
                userId,
                projectId,
            );

        res.cookie(
            STATE_COOKIE,
            nonce,
            {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge:
                    10 * 60 * 1000,
                path: "/",
            },
        );

        return res.redirect(getGithubInstallUrl(state));
        
    } catch (error) {
        console.error(
            "Failed to create GitHub authorization URL:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to start GitHub connection.",
        });
    }
}

export async function githubCallbackController(
    req: Request,
    res: Response,
) {
    const {
        code,
        state,
        error,
        error_description,
    } = req.query;

    if (error) {
        return res.status(400).json({
            success: false,
            message:
                typeof error_description ===
                    "string"
                    ? error_description
                    : `GitHub authorization failed: ${String(error)}`,
        });
    }

    if (
        typeof code !== "string" ||
        typeof state !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Missing GitHub authorization parameters.",
        });
    }

    const stateCookie =
        req.cookies?.[
        STATE_COOKIE
        ];

    if (
        typeof stateCookie !==
        "string"
    ) {
        return res.status(400).json({
            success: false,
            message:
                "GitHub authorization session expired.",
        });
    }

    try {
        const statePayload =
            verifyGithubState(
                state,
            );

        /*
         * The nonce in the signed state must
         * match the HttpOnly cookie created
         * when the MeshIDE user started the flow.
         */
        if (
            statePayload.nonce !==
            stateCookie
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid GitHub authorization state.",
            });
        }

        const token =
            await exchangeGithubCode(
                code,
            );

        /*
         * Verify which GitHub account actually
         * authorized MeshIDE.
         */
        const githubUser =
            await getGithubUser(
                token.access_token!,
            );

        /*
         * Verify which GitHub App installations
         * this GitHub user can access.
         */
        const installations =
            await getGithubInstallations(
                token.access_token!,
            );

        /*
         * Fetch repositories accessible through
         * each installation.
         *
         * We do this from GitHub's API instead of
         * trusting repository information supplied
         * by the browser.
         */
        const installationsWithRepositories =
            await Promise.all(
                installations.installations.map(
                    async (installation) => {
                        const repositories =
                            await getGithubInstallationRepositories(
                                token.access_token!,
                                installation.id,
                            );

                        return {
                            id:
                                installation.id,
                            account:
                                installation
                                    .account
                                    .login,
                            accountId:
                                installation
                                    .account
                                    .id,
                            accountType:
                                installation
                                    .account
                                    .type,
                            repositorySelection:
                                installation
                                    .repository_selection,
                            repositories:
                                repositories
                                    .repositories
                                    .map(
                                        (repository) => ({
                                            id:
                                                repository.id,
                                            name:
                                                repository.name,
                                            fullName:
                                                repository.full_name,
                                            url:
                                                repository.html_url,
                                            private:
                                                repository.private,
                                            owner:
                                                repository
                                                    .owner
                                                    .login,
                                        }),
                                    ),
                        };
                    },
                ),
            );

        const availableRepositories =
            installationsWithRepositories.flatMap(
                (installation) =>
                    installation.repositories.map(
                        (repository) => ({
                            installationId:
                                installation.id,
                            ...repository,
                        }),
                    ),
            );

        if (
            availableRepositories.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "No GitHub repositories are accessible to this installation.",
            });
        }

        if (
            availableRepositories.length > 1
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Multiple GitHub repositories are accessible. Repository selection is required.",
                repositories:
                    availableRepositories,
            });
        }

        const repository =
            availableRepositories[0];

        if (!repository) {
            return res.status(400).json({
                success: false,
                message:
                    "No GitHub repository was selected.",
            });
        }

        /*
         * Persist the verified GitHub repository
         * connection for this MeshIDE project.
         *
         * OAuth tokens are stored.
         * Credential encryption added.
         */
        const accessTokenExpiresAt =
            token.expires_in
                ? new Date(
                    Date.now() +
                    token.expires_in * 1000,
                )
                : undefined;

        const refreshTokenExpiresAt =
            token.refresh_token_expires_in
                ? new Date(
                    Date.now() +
                    token.refresh_token_expires_in *
                    1000,
                )
                : undefined;

        const connection =
            await createGithubConnection({
                projectId:
                    statePayload.projectId,
                githubUserId:
                    githubUser.id,
                githubUsername:
                    githubUser.login,
                installationId:
                    repository.installationId,
                repositoryOwner:
                    repository.owner,
                repositoryName:
                    repository.name,
                repositoryUrl:
                    repository.url,
                accessToken:
                    token.access_token!,
                refreshToken:
                    token.refresh_token,
                accessTokenExpiresAt,
                refreshTokenExpiresAt,
            });

        res.clearCookie(
            STATE_COOKIE,
            {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                path: "/",
            },
        );

        return res.json({
            success: true,
            message:
                "GitHub repository connected.",
            connection,
            githubUser: {
                id: githubUser.id,
                login: githubUser.login,
                avatarUrl:
                    githubUser.avatar_url,
                profileUrl:
                    githubUser.html_url,
            },
            installations:
                installationsWithRepositories,
            meshUserId:
                statePayload.userId,
            projectId:
                statePayload.projectId,
        });
    } catch (error) {
        console.error(
            "GitHub callback failed:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "GitHub authorization failed.",
        });
    }
}

export async function getGithubConnectionController(
    req: Request,
    res: Response,
) {
    const userId = req.userId;

    const projectId =
        typeof req.query.projectId === "string"
            ? req.query.projectId
            : null;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized.",
        });
    }

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: "projectId is required.",
        });
    }

    try {
        const project = await getProjectById(
            projectId,
            userId,
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }

        const connection =
            await getGithubConnectionByProject(
                projectId,
            );

        return res.json({
            success: true,
            connection: connection ?? null,
        });
    } catch (error) {
        console.error(
            "Failed to get GitHub connection:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get GitHub connection.",
        });
    }
}

export async function disconnectGithubController(
    req: Request,
    res: Response,
) {
    const userId = req.userId;

    const projectId =
        typeof req.query.projectId === "string"
            ? req.query.projectId
            : null;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized.",
        });
    }

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: "projectId is required.",
        });
    }

    try {
        const project = await getProjectById(
            projectId,
            userId,
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }

        const deleted =
            await deleteGithubConnection(
                projectId,
            );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message:
                    "GitHub connection not found.",
            });
        }

        return res.json({
            success: true,
            message:
                "GitHub repository disconnected.",
        });
    } catch (error) {
        console.error(
            "Failed to disconnect GitHub:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to disconnect GitHub.",
        });
    }
}

export async function getGithubRepositoryContentsController(
    req: Request,
    res: Response,
) {
    const userId = req.userId;

    const projectId =
        typeof req.query.projectId === "string"
            ? req.query.projectId
            : null;

    const path =
        typeof req.query.path === "string"
            ? req.query.path
            : "";

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized.",
        });
    }

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: "projectId is required.",
        });
    }

    try {
        const project = await getProjectById(
            projectId,
            userId,
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }

        const connection =
            await getGithubConnectionByProject(
                projectId,
            );

        if (!connection) {
            return res.status(404).json({
                success: false,
                message:
                    "GitHub repository is not connected.",
            });
        }

        const credentials =
            await getGithubCredentialsByProject(
                projectId,
            );

        if (!credentials) {
            return res.status(404).json({
                success: false,
                message:
                    "GitHub credentials are not available.",
            });
        }

        const contents =
            await getGithubRepositoryContents(
                credentials.accessToken,
                connection.repositoryOwner,
                connection.repositoryName,
                path,
            );

        return res.json({
            success: true,
            repository: {
                owner:
                    connection.repositoryOwner,
                name:
                    connection.repositoryName,
            },
            path,
            contents,
        });
    } catch (error) {
        console.error(
            "Failed to read GitHub repository contents:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to read GitHub repository.",
        });
    }
}