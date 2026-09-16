import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { githubConnections } from "../../db/schema/github-connections.js";
import { decryptSecret, encryptSecret } from "../../lib/crypto/encryption.js";

interface CreateGithubConnectionInput {
    projectId: string;
    githubUserId: number;
    githubUsername: string;
    installationId: number;
    repositoryOwner: string;
    repositoryName: string;
    repositoryUrl: string;
    accessToken: string;
    refreshToken?: string | undefined;
    accessTokenExpiresAt?: Date | undefined;
    refreshTokenExpiresAt?: Date | undefined;
}

export async function createGithubConnection(
    input: CreateGithubConnectionInput,
) {
    const encryptedAccessToken =
        encryptSecret(input.accessToken);

    const encryptedRefreshToken =
        input.refreshToken
            ? encryptSecret(input.refreshToken)
            : null;

    const [connection] = await db
        .insert(githubConnections)
        .values({
            projectId: input.projectId,
            githubUserId: input.githubUserId,
            githubUsername: input.githubUsername,
            installationId: input.installationId,
            repositoryOwner: input.repositoryOwner,
            repositoryName: input.repositoryName,
            repositoryUrl: input.repositoryUrl,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            accessTokenExpiresAt:
                input.accessTokenExpiresAt ?? null,
            refreshTokenExpiresAt:
                input.refreshTokenExpiresAt ?? null,
        })
        .onConflictDoUpdate({
            target: githubConnections.projectId,
            set: {
                githubUserId: input.githubUserId,
                githubUsername: input.githubUsername,
                installationId: input.installationId,
                repositoryOwner: input.repositoryOwner,
                repositoryName: input.repositoryName,
                repositoryUrl: input.repositoryUrl,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                accessTokenExpiresAt:
                    input.accessTokenExpiresAt ?? null,
                refreshTokenExpiresAt:
                    input.refreshTokenExpiresAt ?? null,
                updatedAt: new Date(),
            },
        })
        .returning({
            id: githubConnections.id,
            projectId: githubConnections.projectId,
            githubUserId: githubConnections.githubUserId,
            githubUsername: githubConnections.githubUsername,
            installationId: githubConnections.installationId,
            repositoryOwner: githubConnections.repositoryOwner,
            repositoryName: githubConnections.repositoryName,
            repositoryUrl: githubConnections.repositoryUrl,
            createdAt: githubConnections.createdAt,
            updatedAt: githubConnections.updatedAt,
        });

    if (!connection) {
        throw new Error(
            "GITHUB_CONNECTION_CREATION_FAILED",
        );
    }

    return connection;
}

export async function getGithubConnectionByProject(
    projectId: string,
) {
    const [connection] = await db
        .select({
            id: githubConnections.id,
            projectId: githubConnections.projectId,
            githubUserId: githubConnections.githubUserId,
            githubUsername: githubConnections.githubUsername,
            installationId: githubConnections.installationId,
            repositoryOwner: githubConnections.repositoryOwner,
            repositoryName: githubConnections.repositoryName,
            repositoryUrl: githubConnections.repositoryUrl,
            accessToken: githubConnections.accessToken,
            refreshToken: githubConnections.refreshToken,
            accessTokenExpiresAt:
                githubConnections.accessTokenExpiresAt,
            refreshTokenExpiresAt:
                githubConnections.refreshTokenExpiresAt,
            createdAt: githubConnections.createdAt,
            updatedAt: githubConnections.updatedAt,
        })
        .from(githubConnections)
        .where(
            eq(
                githubConnections.projectId,
                projectId,
            ),
        )
        .limit(1);

    return connection;
}

export async function deleteGithubConnection(
    projectId: string,
) {
    const [connection] = await db
        .delete(githubConnections)
        .where(
            eq(
                githubConnections.projectId,
                projectId,
            ),
        )
        .returning({
            id: githubConnections.id,
        });

    return connection;
}

export async function getGithubCredentialsByProject(
    projectId: string,
) {
    const [connection] = await db
        .select({
            accessToken:
                githubConnections.accessToken,
            refreshToken:
                githubConnections.refreshToken,
            accessTokenExpiresAt:
                githubConnections.accessTokenExpiresAt,
            refreshTokenExpiresAt:
                githubConnections.refreshTokenExpiresAt,
        })
        .from(githubConnections)
        .where(
            eq(
                githubConnections.projectId,
                projectId,
            ),
        )
        .limit(1);

    if (!connection) {
        return undefined;
    }

    if (!connection.accessToken) {
        throw new Error(
            "GitHub access token is missing.",
        );
    }

    return {
        accessToken: decryptSecret(
            connection.accessToken,
        ),
        refreshToken:
            connection.refreshToken
                ? decryptSecret(
                    connection.refreshToken,
                )
                : undefined,
        accessTokenExpiresAt:
            connection.accessTokenExpiresAt,
        refreshTokenExpiresAt:
            connection.refreshTokenExpiresAt,
    };
}