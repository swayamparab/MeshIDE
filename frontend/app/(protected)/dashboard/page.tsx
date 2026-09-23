"use client";

import {
    FormEvent,
    useEffect,
    useState,
} from "react";
import Link from "next/link";

import {
    useCreateProject,
    useDeleteProject,
    useProjects,
    useUpdateProject,
} from "@/hooks/project/useProjects";
import { useCurrentUser } from "@/hooks/useAuth";
import { logout } from "@/services/auth";

type Dialog =
    | {
        type: "edit" | "delete";
        projectId: string;
    }
    | null;

export default function DashboardPage() {
    const userQuery = useCurrentUser();
    const projectsQuery = useProjects();

    const createProjectMutation =
        useCreateProject();

    const updateProjectMutation =
        useUpdateProject();

    const deleteProjectMutation =
        useDeleteProject();

    const [projectName, setProjectName] =
        useState("");

    const [projectDescription, setProjectDescription] =
        useState("");

    const [showCreateForm, setShowCreateForm] =
        useState(false);

    const [error, setError] = useState("");

    const [dialog, setDialog] =
        useState<Dialog>(null);

    const [editName, setEditName] =
        useState("");

    const [editDescription, setEditDescription] =
        useState("");

    async function handleCreateProject(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");

        if (!projectName.trim()) {
            setError(
                "Project name is required",
            );
            return;
        }

        createProjectMutation.mutate(
            {
                name: projectName.trim(),
                description:
                    projectDescription.trim() ||
                    undefined,
            },
            {
                onSuccess: () => {
                    setProjectName("");
                    setProjectDescription("");
                    setShowCreateForm(false);
                },
                onError: (error) => {
                    setError(
                        error instanceof Error
                            ? error.message
                            : "Failed to create project",
                    );
                },
            },
        );
    }

    function openEditDialog(
        projectId: string,
    ) {
        const project =
            projectsQuery.data?.projects.find(
                (item) =>
                    item.id === projectId,
            );

        if (!project) {
            return;
        }

        setEditName(project.name);
        setEditDescription(
            project.description ?? "",
        );

        setDialog({
            type: "edit",
            projectId,
        });
    }

    function openDeleteDialog(
        projectId: string,
    ) {
        setDialog({
            type: "delete",
            projectId,
        });
    }

    function closeDialog() {
        if (
            updateProjectMutation.isPending ||
            deleteProjectMutation.isPending
        ) {
            return;
        }

        setDialog(null);
    }

    function handleEditProject(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        if (!dialog || dialog.type !== "edit") {
            return;
        }

        const name = editName.trim();

        if (!name) {
            return;
        }

        updateProjectMutation.mutate(
            {
                projectId: dialog.projectId,
                data: {
                    name,
                    description:
                        editDescription.trim(),
                },
            },
            {
                onSuccess: () => {
                    setDialog(null);
                },
                onError: (error: any) => {
                    if (
                        error?.response?.status ===
                        409
                    ) {
                        return;
                    }

                    console.error(
                        "Update project error:",
                        error,
                    );
                },
            },
        );
    }

    function handleDeleteProject() {
        if (
            !dialog ||
            dialog.type !== "delete"
        ) {
            return;
        }

        deleteProjectMutation.mutate(
            dialog.projectId,
            {
                onSuccess: () => {
                    setDialog(null);
                },
                onError: (error) => {
                    console.error(
                        "Delete project error:",
                        error,
                    );
                },
            },
        );
    }

    useEffect(() => {
        function handleEscape(
            event: KeyboardEvent,
        ) {
            if (event.key === "Escape") {
                closeDialog();
            }
        }

        if (dialog) {
            document.addEventListener(
                "keydown",
                handleEscape,
            );
        }

        return () => {
            document.removeEventListener(
                "keydown",
                handleEscape,
            );
        };
    }, [
        dialog,
        updateProjectMutation.isPending,
        deleteProjectMutation.isPending,
    ]);

    async function handleLogout() {
        try {
            await logout();
        } finally {
            window.location.href = "/login";
        }
    }

    const loading =
        userQuery.isLoading ||
        projectsQuery.isLoading;

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-500">
                Loading Mesh...
            </main>
        );
    }

    const username =
        userQuery.data?.user.username ?? "";

    const projects =
        projectsQuery.data?.projects ?? [];

    const activeProject =
        dialog
            ? projects.find(
                (project) =>
                    project.id ===
                    dialog.projectId,
            )
            : null;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <header className="border-b border-zinc-800">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
                    <Link
                        href="/dashboard"
                        className="text-lg font-semibold tracking-tight"
                    >
                        Mesh
                    </Link>

                    <div className="flex items-center gap-4">
                        <span className="text-sm text-zinc-500">
                            {username}
                        </span>

                        <button
                            onClick={handleLogout}
                            className="text-sm text-zinc-500 transition hover:text-zinc-200"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-6 py-10">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Your Projects
                        </h1>

                        <p className="mt-1 text-sm text-zinc-500">
                            Create a project and start
                            building.
                        </p>
                    </div>

                    <button
                        onClick={() =>
                            setShowCreateForm(
                                (current) =>
                                    !current,
                            )
                        }
                        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
                    >
                        + New Project
                    </button>
                </div>

                {showCreateForm && (
                    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                        <h2 className="mb-5 font-medium">
                            Create project
                        </h2>

                        <form
                            onSubmit={
                                handleCreateProject
                            }
                            className="space-y-4"
                        >
                            <div>
                                <label
                                    htmlFor="project-name"
                                    className="mb-1.5 block text-sm text-zinc-400"
                                >
                                    Name
                                </label>

                                <input
                                    id="project-name"
                                    value={projectName}
                                    onChange={(
                                        event,
                                    ) =>
                                        setProjectName(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    placeholder="My project"
                                    maxLength={100}
                                    autoFocus
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="project-description"
                                    className="mb-1.5 block text-sm text-zinc-400"
                                >
                                    Description
                                </label>

                                <textarea
                                    id="project-description"
                                    value={
                                        projectDescription
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setProjectDescription(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    placeholder="What are you building?"
                                    maxLength={500}
                                    rows={3}
                                    className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-400">
                                    {error}
                                </p>
                            )}

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateForm(
                                            false,
                                        );
                                        setError("");
                                    }}
                                    className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={
                                        createProjectMutation.isPending
                                    }
                                    className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {createProjectMutation.isPending
                                        ? "Creating..."
                                        : "Create project"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {projectsQuery.isError ? (
                    <div className="rounded-xl border border-red-900/50 bg-red-950/20 py-20 text-center">
                        <h2 className="font-medium text-red-300">
                            Failed to load projects
                        </h2>

                        <p className="mt-2 text-sm text-red-400/70">
                            Please try refreshing the
                            page.
                        </p>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 py-20 text-center">
                        <h2 className="font-medium text-zinc-300">
                            No projects yet
                        </h2>

                        <p className="mt-2 text-sm text-zinc-500">
                            Create your first project to
                            get started.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {projects.map(
                            (project) => (
                                <div
                                    key={
                                        project.id
                                    }
                                    className="group relative rounded-xl border border-zinc-800 bg-zinc-900/40 transition hover:border-zinc-700 hover:bg-zinc-900"
                                >
                                    <Link
                                        href={`/projects/${project.id}`}
                                        className="block p-5 pr-14"
                                    >
                                        <h2 className="font-medium text-zinc-200 group-hover:text-white">
                                            {
                                                project.name
                                            }
                                        </h2>

                                        <p className="mt-2 min-h-10 text-sm text-zinc-500">
                                            {project.description ||
                                                "No description"}
                                        </p>

                                        <div className="mt-5 text-xs text-zinc-600">
                                            Updated{" "}
                                            {new Date(
                                                project.updatedAt,
                                            ).toLocaleDateString()}
                                        </div>
                                    </Link>

                                    <div className="absolute right-3 top-3">
                                        <button
                                            type="button"
                                            aria-label={`Actions for ${project.name}`}
                                            onClick={(
                                                event,
                                            ) => {
                                                event.preventDefault();
                                                event.stopPropagation();

                                                const menu =
                                                    document.getElementById(
                                                        `project-menu-${project.id}`,
                                                    );

                                                if (
                                                    menu
                                                ) {
                                                    menu.classList.toggle(
                                                        "hidden",
                                                    );
                                                }
                                            }}
                                            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
                                        >
                                            <span className="text-lg leading-none">
                                                ⋯
                                            </span>
                                        </button>

                                        <div
                                            id={`project-menu-${project.id}`}
                                            className="absolute right-0 top-9 z-20 hidden w-36 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openEditDialog(
                                                        project.id,
                                                    );

                                                    document
                                                        .getElementById(
                                                            `project-menu-${project.id}`,
                                                        )
                                                        ?.classList.add(
                                                            "hidden",
                                                        );
                                                }}
                                                className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                            >
                                                Edit project
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openDeleteDialog(
                                                        project.id,
                                                    );

                                                    document
                                                        .getElementById(
                                                            `project-menu-${project.id}`,
                                                        )
                                                        ?.classList.add(
                                                            "hidden",
                                                        );
                                                }}
                                                className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-900 hover:text-red-300"
                                            >
                                                Delete project
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ),
                        )}
                    </div>
                )}
            </div>

            {dialog &&
                activeProject && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
                        onMouseDown={(
                            event,
                        ) => {
                            if (
                                event.target ===
                                event.currentTarget
                            ) {
                                closeDialog();
                            }
                        }}
                    >
                        <div
                            className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
                            onMouseDown={(
                                event,
                            ) =>
                                event.stopPropagation()
                            }
                        >
                            {dialog.type ===
                                "edit" ? (
                                <>
                                    <div className="border-b border-zinc-800 px-5 py-4">
                                        <h2 className="text-sm font-medium text-zinc-100">
                                            Edit project
                                        </h2>
                                    </div>

                                    <form
                                        onSubmit={
                                            handleEditProject
                                        }
                                    >
                                        <div className="space-y-4 px-5 py-5">
                                            <div>
                                                <label
                                                    htmlFor="edit-project-name"
                                                    className="mb-1.5 block text-sm text-zinc-400"
                                                >
                                                    Name
                                                </label>

                                                <input
                                                    id="edit-project-name"
                                                    value={
                                                        editName
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        setEditName(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                    }
                                                    maxLength={
                                                        100
                                                    }
                                                    autoFocus
                                                    disabled={
                                                        updateProjectMutation.isPending
                                                    }
                                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
                                                />
                                            </div>

                                            <div>
                                                <label
                                                    htmlFor="edit-project-description"
                                                    className="mb-1.5 block text-sm text-zinc-400"
                                                >
                                                    Description
                                                </label>

                                                <textarea
                                                    id="edit-project-description"
                                                    value={
                                                        editDescription
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        setEditDescription(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                    }
                                                    maxLength={
                                                        500
                                                    }
                                                    rows={
                                                        3
                                                    }
                                                    disabled={
                                                        updateProjectMutation.isPending
                                                    }
                                                    className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
                                                />
                                            </div>

                                            {updateProjectMutation.isError && (
                                                <p className="text-sm text-red-400">
                                                    {(
                                                        updateProjectMutation.error as any
                                                    )?.response
                                                        ?.status ===
                                                        409
                                                        ? "A project with this name already exists."
                                                        : "Failed to update project."}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
                                            <button
                                                type="button"
                                                onClick={
                                                    closeDialog
                                                }
                                                disabled={
                                                    updateProjectMutation.isPending
                                                }
                                                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>

                                            <button
                                                type="submit"
                                                disabled={
                                                    updateProjectMutation.isPending ||
                                                    !editName.trim()
                                                }
                                                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {updateProjectMutation.isPending
                                                    ? "Saving..."
                                                    : "Save changes"}
                                            </button>
                                        </div>
                                    </form>
                                </>
                            ) : (
                                <>
                                    <div className="border-b border-zinc-800 px-5 py-4">
                                        <h2 className="text-sm font-medium text-zinc-100">
                                            Delete project
                                        </h2>
                                    </div>

                                    <div className="px-5 py-5">
                                        <p className="text-sm leading-6 text-zinc-400">
                                            Delete{" "}
                                            <span className="font-medium text-zinc-100">
                                                "
                                                {
                                                    activeProject.name
                                                }
                                                "
                                            </span>
                                            ?
                                        </p>

                                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                                            This will permanently
                                            delete the project and
                                            everything inside it.
                                            This action cannot be
                                            undone.
                                        </p>
                                    </div>

                                    <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
                                        <button
                                            type="button"
                                            onClick={
                                                closeDialog
                                            }
                                            disabled={
                                                deleteProjectMutation.isPending
                                            }
                                            className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="button"
                                            onClick={
                                                handleDeleteProject
                                            }
                                            disabled={
                                                deleteProjectMutation.isPending
                                            }
                                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {deleteProjectMutation.isPending
                                                ? "Deleting..."
                                                : "Delete project"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
        </main>
    );
}