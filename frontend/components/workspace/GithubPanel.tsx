"use client";

import {
    useGithubConnect,
    useGithubConnection,
    useGithubDisconnect,
} from "@/hooks/github/useGithub";

interface GitHubPanelProps {
    projectId: string;
}

export default function GitHubPanel({
    projectId,
}: GitHubPanelProps) {
    const connectionQuery = useGithubConnection(projectId);
    const connectMutation = useGithubConnect();
    const disconnectMutation = useGithubDisconnect();

    const connection = connectionQuery.data;

    function handleConnect() {
        connectMutation.mutate(projectId);
    }

    function handleDisconnect() {
        const shouldDisconnect = window.confirm(
            "Are you sure you want to disconnect this GitHub repository?",
        );

        if (shouldDisconnect) {
            disconnectMutation.mutate(projectId);
        }
    }

    if (connectionQuery.isLoading) {
        return (
            <div className="border-b border-zinc-800 p-3">
                <p className="text-xs text-zinc-500">
                    Checking GitHub connection...
                </p>
            </div>
        );
    }

    return (
        <div className="border-b border-zinc-800 p-3">
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    GitHub
                </span>

                <span
                    className={`h-2 w-2 rounded-full ${connection
                            ? "bg-emerald-500"
                            : "bg-zinc-600"
                        }`}
                />
            </div>

            {connection ? (
                <div className="space-y-3">
                    <div>
                        <p className="text-xs font-medium text-zinc-200">
                            {connection.githubUsername}
                        </p>

                        <p className="mt-1 break-all text-xs text-zinc-500">
                            {connection.repositoryOwner}/
                            {connection.repositoryName}
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <a
                            href={connection.repositoryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-zinc-700 px-3 py-2 text-center text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                        >
                            Open Repository ↗
                        </a>

                        <button
                            type="button"
                            onClick={handleDisconnect}
                            disabled={
                                disconnectMutation.isPending
                            }
                            className="rounded-md border border-red-900/60 px-3 py-2 text-xs text-red-400 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {disconnectMutation.isPending
                                ? "Disconnecting..."
                                : "Disconnect"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs leading-5 text-zinc-500">
                        Connect a GitHub repository to sync and
                        push your project code.
                    </p>

                    <button
                        type="button"
                        onClick={handleConnect}
                        disabled={connectMutation.isPending}
                        className="w-full rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {connectMutation.isPending
                            ? "Connecting..."
                            : "Connect GitHub"}
                    </button>
                </div>
            )}

            {connectionQuery.isError && (
                <p className="mt-2 text-xs text-red-400">
                    Failed to load GitHub connection.
                </p>
            )}

            {connectMutation.isError && (
                <p className="mt-2 text-xs text-red-400">
                    Failed to start GitHub authorization.
                </p>
            )}

            {disconnectMutation.isError && (
                <p className="mt-2 text-xs text-red-400">
                    Failed to disconnect GitHub.
                </p>
            )}
        </div>
    );
}