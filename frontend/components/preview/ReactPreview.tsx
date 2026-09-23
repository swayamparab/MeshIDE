"use client";

import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import type {
    FileSystemTree,
    WebContainer,
} from "@webcontainer/api";

import { getWebContainer } from "@/lib/webcontainer/webcontainer";
import {
    buildWebContainerFiles,
} from "@/lib/webcontainer/webcontainer-files";
import {
    deleteFileFromWebContainer,
    syncFileToWebContainer,
} from "@/lib/webcontainer/webcontainer-sync";
import type { ProjectFile } from "@/services/file";

interface OpenFile {
    id: string;
    name: string;
    content: string;
    savedContent: string;
}

export interface ReactPreviewHandle {
    syncFile: (
        path: string,
        content: string,
    ) => Promise<void>;

    deleteFile: (
        path: string,
    ) => Promise<void>;
}

interface ReactPreviewProps {
    projectId: string;
    files: ProjectFile[];
    openFiles: OpenFile[];
    isOpen: boolean;
}

const ReactPreview = forwardRef<
    ReactPreviewHandle,
    ReactPreviewProps
>(function ReactPreview(
    {
        projectId,
        files,
        openFiles,
        isOpen,
    },
    ref,
) {
    const [status, setStatus] =
        useState("Ready");

    const [previewUrl, setPreviewUrl] =
        useState<string | null>(null);

    const [isRunning, setIsRunning] =
        useState(false);

    const devProcessRef = useRef<
        Awaited<
            ReturnType<WebContainer["spawn"]>
        > | null
    >(null);

    const containerRef =
        useRef<WebContainer | null>(null);

    useImperativeHandle(
        ref,
        () => ({
            async syncFile(path, content) {
                const container =
                    containerRef.current;

                if (!container) {
                    return;
                }

                await syncFileToWebContainer(
                    container,
                    path,
                    content,
                );
            },

            async deleteFile(path) {
                const container =
                    containerRef.current;

                if (!container) {
                    return;
                }

                await deleteFileFromWebContainer(
                    container,
                    path,
                );
            },
        }),
        [],
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        let cancelled = false;

        async function startProject() {
            try {
                setIsRunning(true);
                setPreviewUrl(null);
                setStatus(
                    "Starting project runtime...",
                );

                const container =
                    await getWebContainer();

                containerRef.current =
                    container;

                if (cancelled) {
                    return;
                }

                /*
                 * Start with the files stored in PostgreSQL.
                 */
                const projectFiles = [
                    ...files,
                ];

                /*
                 * Overlay currently open editor files.
                 *
                 * This means the user doesn't have to
                 * save every file before running the project.
                 */
                for (const openFile of openFiles) {
                    const existingIndex =
                        projectFiles.findIndex(
                            (file) =>
                                file.id ===
                                openFile.id,
                        );

                    if (
                        existingIndex !== -1
                    ) {
                        projectFiles[
                            existingIndex
                        ] = {
                            ...projectFiles[
                                existingIndex
                            ],
                            content:
                                openFile.content,
                        };
                    }
                }

                /*
                 * Every runnable project needs package.json.
                 */
                const packageJsonFile =
                    projectFiles.find(
                        (file) =>
                            file.parentId === null &&
                            file.name === "package.json" &&
                            file.type === "file",
                    );

                if (!packageJsonFile) {
                    throw new Error(
                        "This project does not contain a package.json.",
                    );
                }

                const packageJson =
                    packageJsonFile.content ?? "";

                if (!packageJson.trim()) {
                    throw new Error(
                        "Invalid package.json.",
                    );
                }

                /*
                 * Build the project filesystem.
                 */
                const filesystem =
                    buildWebContainerFiles(
                        projectFiles,
                    );

                setStatus(
                    "Mounting project files...",
                );

                await container.mount(
                    filesystem as FileSystemTree,
                );

                if (cancelled) {
                    return;
                }

                setStatus(
                    "Installing dependencies...",
                );

                const installProcess =
                    await container.spawn(
                        "npm",
                        ["install"],
                    );

                const installExitCode =
                    await installProcess.exit;

                if (cancelled) {
                    return;
                }

                if (
                    installExitCode !== 0
                ) {
                    throw new Error(
                        "npm install failed.",
                    );
                }

                setStatus(
                    "Starting Vite...",
                );

                /*
                 * Listen before starting the process so
                 * we don't miss the server-ready event.
                 */
                container.on(
                    "server-ready",
                    (
                        port,
                        url,
                    ) => {
                        if (cancelled) {
                            return;
                        }

                        // console.log(
                        //     "[MeshIDE] Server ready:",
                        //     {
                        //         port,
                        //         url,
                        //     },
                        // );

                        setPreviewUrl(url);

                        setStatus(
                            "React app is running.",
                        );
                    },
                );

                /*
                 * Start the project's Vite development server.
                 */
                const devProcess =
                    await container.spawn(
                        "npm",
                        [
                            "run",
                            "dev",
                            "--",
                            "--host",
                            "0.0.0.0",
                        ],
                    );

                devProcessRef.current =
                    devProcess;

                /*
                 * Keep project output available in the
                 * browser console for now.
                 */
                devProcess.output.pipeTo(
                    new WritableStream({
                        write(data) {
                            // console.log(
                            //     "[MeshIDE Project]",
                            //     data,
                            // );
                        },
                    }),
                );

                devProcess.exit.then(
                    (exitCode) => {
                        if (cancelled) {
                            return;
                        }

                        setIsRunning(false);

                        if (
                            exitCode !== 0
                        ) {
                            setStatus(
                                `Project exited with code ${exitCode}.`,
                            );
                        } else {
                            setStatus(
                                "Project stopped.",
                            );
                        }
                    },
                );
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error(error);

                setIsRunning(false);

                setStatus(
                    error instanceof Error
                        ? error.message
                        : "Failed to run project.",
                );
            }
        }

        startProject();

        return () => {
            cancelled = true;

            /*
             * Stop the development process when the
             * preview component is removed.
             */
            devProcessRef.current?.kill();

            devProcessRef.current =
                null;

            containerRef.current =
                null;
        };
    }, [isOpen, projectId]);

    if (!isOpen) {
        return null;
    }

    return (
        <section className="flex min-h-0 flex-1 flex-col bg-zinc-950">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Preview
                    </span>

                    <span
                        className={`h-1.5 w-1.5 rounded-full ${
                            isRunning
                                ? "bg-emerald-500"
                                : "bg-zinc-700"
                        }`}
                    />
                </div>

                <span className="text-[10px] text-zinc-600">
                    {status}
                </span>
            </div>

            <div className="min-h-0 flex-1 bg-white">
                {previewUrl ? (
                    <iframe
                        src={previewUrl}
                        title={`Preview of project ${projectId}`}
                        className="h-full w-full border-0"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center bg-zinc-950">
                        <div className="text-center">
                            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />

                            <p className="text-xs text-zinc-500">
                                {status}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
});

ReactPreview.displayName = "ReactPreview";

export default ReactPreview;