"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Link from "next/link";

import {
    useCreateFile,
    useCreateFolder,
    useProjectFiles,
} from "@/hooks/useProjectFiles";

import {
    useFile,
    useUpdateFile,
    useDeleteFile,
} from "@/hooks/useFile";

import type { ProjectFile } from "@/services/file";

import CodeEditor from "@/components/editor/CodeEditor";

import { getLanguageFromFileName } from "@/lib/editor/language";

import FileTree from "./FileTree";
import CreateItemDialog from "./CreateItemDialog";
import WorkspaceDialog from "./WorkspaceDialog";
import Terminal from "@/components/terminal/Terminal";

import ReactPreview, { type ReactPreviewHandle } from "@/components/preview/ReactPreview";
import { getProjectFilePath } from "@/lib/webcontainer/webcontainer-files";
// import GitHubPanel from "./GithubPanel";
// import GithubRepositoryBrowser from "./GithubRepositoryBrowser";\
import AddCollaboratorsDialog from "./AddCollaboratorsDialog";

interface WorkspaceProps {
    projectId: string;
}

interface OpenFile {
    id: string;
    name: string;
    content: string;
    savedContent: string;
}

export default function Workspace({
    projectId,
}: WorkspaceProps) {
    const [
        activeFileId,
        setActiveFileId,
    ] = useState<string | null>(null);

    const [
        openFiles,
        setOpenFiles,
    ] = useState<OpenFile[]>([]);

    const [
        selectedFolderId,
        setSelectedFolderId,
    ] = useState<string | null>(null);

    const [
        expandedFolders,
        setExpandedFolders,
    ] = useState<Set<string>>(
        new Set(),
    );

    const [
        newItemType,
        setNewItemType,
    ] = useState<
        "file" | "folder" | null
    >(null);

    const [
        newItemName,
        setNewItemName,
    ] = useState("");

    const [
        createError,
        setCreateError,
    ] = useState<string | null>(
        null,
    );

    const [
        creationParentId,
        setCreationParentId,
    ] = useState<string | null>(
        null,
    );

    const [
        contextMenu,
        setContextMenu,
    ] = useState<{
        x: number;
        y: number;
        parentId: string | null;
        fileId?: string;
    } | null>(null);

    const [dialog, setDialog] = useState<{
        type: "rename" | "delete" | "move";
        fileId: string;
    } | null>(null);

    const [terminalOpen, setTerminalOpen] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);

    const [runCommand, setRunCommand] = useState<{
        fileName: string;
        content: string;
    } | null>(null);

    const previewRef = useRef<ReactPreviewHandle>(null);

    const previewSyncTimers = useRef<
        Record<string, ReturnType<typeof setTimeout>>
    >({});

    const filesQuery = useProjectFiles(projectId);

    const selectedFileQuery =
        useFile(
            projectId,
            activeFileId,
        );

    const updateFileMutation =
        useUpdateFile();

    const deleteFileMutation =
        useDeleteFile();

    const createFileMutation =
        useCreateFile();

    const createFolderMutation =
        useCreateFolder();

    const files: ProjectFile[] =
        filesQuery.data?.files ?? [];

    const selectedFile =
        selectedFileQuery.data?.file ??
        null;

    const activeOpenFile =
        openFiles.find(
            (file) =>
                file.id === activeFileId,
        ) ?? null;

    const hasUnsavedChanges =
        openFiles.some(
            (file) =>
                file.content !==
                file.savedContent,
        );

    const activeFileHasUnsavedChanges =
        activeOpenFile
            ? activeOpenFile.content !==
            activeOpenFile.savedContent
            : false;

    /*
     * When a file is selected from the Explorer,
     * fetch it from the backend and add it to the
     * open tabs if it isn't already open.
     */
    useEffect(() => {
        if (!selectedFile) {
            return;
        }

        setOpenFiles((current) => {
            const alreadyOpen =
                current.some(
                    (file) =>
                        file.id ===
                        selectedFile.id,
                );

            if (alreadyOpen) {
                return current;
            }

            const content =
                selectedFile.content ??
                "";

            return [
                ...current,
                {
                    id: selectedFile.id,
                    name: selectedFile.name,
                    content,
                    savedContent: content,
                },
            ];
        });
    }, [selectedFile]);

    /*
     * Keep tab names in sync with the Explorer.
     * This is especially useful after a rename.
     */
    useEffect(() => {
        if (files.length === 0) {
            return;
        }

        setOpenFiles((current) =>
            current.map((openFile) => {
                const file =
                    files.find(
                        (item) =>
                            item.id ===
                            openFile.id,
                    );

                if (!file) {
                    return openFile;
                }

                if (
                    file.name ===
                    openFile.name
                ) {
                    return openFile;
                }

                return {
                    ...openFile,
                    name: file.name,
                };
            }),
        );
    }, [files]);

    const filesByParent = useMemo(() => {
        const map = new Map<
            string | null,
            ProjectFile[]
        >();

        for (const file of files) {
            const parentId =
                file.parentId;

            if (!map.has(parentId)) {
                map.set(
                    parentId,
                    [],
                );
            }

            map.get(parentId)!.push(
                file,
            );
        }

        for (const children of map.values()) {
            children.sort(
                (a, b) => {
                    if (
                        a.type !==
                        b.type
                    ) {
                        return a.type ===
                            "folder"
                            ? -1
                            : 1;
                    }

                    return a.name.localeCompare(
                        b.name,
                    );
                },
            );
        }

        return map;
    }, [files]);

    /*
     * Warn before leaving the workspace if ANY
     * open tab contains unsaved changes.
     */
    useEffect(() => {
        function handleBeforeUnload(
            event: BeforeUnloadEvent,
        ) {
            if (
                !hasUnsavedChanges
            ) {
                return;
            }

            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener(
            "beforeunload",
            handleBeforeUnload,
        );

        return () => {
            window.removeEventListener(
                "beforeunload",
                handleBeforeUnload,
            );
        };
    }, [hasUnsavedChanges]);

    /*
     * Close context menu when clicking elsewhere
     * or pressing Escape.
     */
    useEffect(() => {
        function handleOutsideContextMenuClick(
            event: MouseEvent,
        ) {
            const target =
                event.target;

            if (
                target instanceof Element &&
                target.closest(
                    "[data-context-menu]",
                )
            ) {
                return;
            }

            setContextMenu(null);
        }

        function handleEscape(
            event: KeyboardEvent,
        ) {
            if (
                event.key === "Escape"
            ) {
                setContextMenu(null);
            }
        }

        document.addEventListener(
            "mousedown",
            handleOutsideContextMenuClick,
        );

        document.addEventListener(
            "keydown",
            handleEscape,
        );

        return () => {
            document.removeEventListener(
                "mousedown",
                handleOutsideContextMenuClick,
            );

            document.removeEventListener(
                "keydown",
                handleEscape,
            );
        };
    }, []);

    function toggleFolder(
        fileId: string,
    ) {
        setExpandedFolders(
            (current) => {
                const next =
                    new Set(
                        current,
                    );

                if (
                    next.has(
                        fileId,
                    )
                ) {
                    next.delete(
                        fileId,
                    );
                } else {
                    next.add(
                        fileId,
                    );
                }

                return next;
            },
        );
    }

    function handleSelectFolder(
        folderId: string,
    ) {
        setSelectedFolderId(
            folderId,
        );

        /*
         * Selecting a folder should NOT close the
         * currently active editor tab.
         */
        setContextMenu(null);
    }

    function clearExplorerSelection() {
        setSelectedFolderId(
            null,
        );

        /*
         * Do not clear activeFileId here.
         * The editor should stay open when the
         * Explorer background is clicked.
         */
        setContextMenu(null);
    }

    function handleSelectFile(
        fileId: string,
    ) {
        setActiveFileId(fileId);

        setSelectedFolderId(null);
        setContextMenu(null);
    }

    function handleSave() {
        if (
            !activeOpenFile ||
            activeOpenFile.content ===
            activeOpenFile.savedContent ||
            updateFileMutation.isPending
        ) {
            return;
        }

        updateFileMutation.mutate(
            {
                projectId,
                fileId: activeOpenFile.id,
                content: activeOpenFile.content,
            },
            {
                onSuccess: () => {
                    setOpenFiles(
                        (current) =>
                            current.map(
                                (file) =>
                                    file.id ===
                                        activeOpenFile.id
                                        ? {
                                            ...file,
                                            savedContent:
                                                file.content,
                                        }
                                        : file,
                            ),
                    );
                },
            },
        );
    }

    function handleRename() {
        if (!contextMenu?.fileId) {
            return;
        }

        setDialog({
            type: "rename",
            fileId: contextMenu.fileId,
        });

        setContextMenu(null);
    }

    function handleDelete() {
        if (!contextMenu?.fileId) {
            return;
        }

        setDialog({
            type: "delete",
            fileId: contextMenu.fileId,
        });

        setContextMenu(null);
    }

    function handleDialogConfirm(
        value?: string,
    ) {
        if (!dialog) {
            return;
        }

        const file = files.find(
            (item) =>
                item.id ===
                dialog.fileId,
        );

        if (!file) {
            setDialog(null);
            return;
        }

        /*
         * RENAME
         */
        if (
            dialog.type === "rename"
        ) {
            const newName =
                value?.trim();

            if (!newName) {
                return;
            }

            updateFileMutation.mutate(
                {
                    projectId,
                    fileId: file.id,
                    name: newName,
                },
                {
                    onSuccess: (
                        response,
                    ) => {
                        /*
                         * Update the open tab immediately
                         * if this file is currently open.
                         */
                        setOpenFiles(
                            (current) =>
                                current.map(
                                    (
                                        openFile,
                                    ) =>
                                        openFile.id ===
                                            file.id
                                            ? {
                                                ...openFile,
                                                name:
                                                    response
                                                        .file
                                                        .name,
                                            }
                                            : openFile,
                                ),
                        );

                        setDialog(null);
                    },
                    onError: (
                        error: any,
                    ) => {
                        if (
                            error?.response
                                ?.status ===
                            409
                        ) {
                            window.alert(
                                "A file or folder with this name already exists here.",
                            );
                            return;
                        }

                        window.alert(
                            "Failed to rename item.",
                        );
                    },
                },
            );

            return;
        }

        /*
         * MOVE
         */
        if (
            dialog.type === "move"
        ) {
            updateFileMutation.mutate(
                {
                    projectId,
                    fileId: file.id,
                    parentId:
                        value ||
                        null,
                },
                {
                    onSuccess: () => {
                        setDialog(null);
                    },
                    onError: (
                        error: any,
                    ) => {
                        if (
                            error?.response
                                ?.status ===
                            409
                        ) {
                            window.alert(
                                "A file or folder with this name already exists in the destination.",
                            );

                            return;
                        }

                        if (
                            error?.response
                                ?.status ===
                            400
                        ) {
                            window.alert(
                                "This item cannot be moved to that folder.",
                            );

                            return;
                        }

                        window.alert(
                            "Failed to move item.",
                        );
                    },
                },
            );

            return;
        }

        /*
         * DELETE
         */
        deleteFileMutation.mutate(
            {
                projectId,
                fileId: file.id,
            },
            {
                onSuccess: () => {

                    const deletedPath =
                        getProjectFilePath(
                            file.id,
                            files,
                        );

                    void previewRef.current
                        ?.deleteFile(deletedPath)
                        .catch((error) => {
                            console.error(
                                "Failed to delete file from preview:",
                                error,
                            );
                        });

                    /*
                     * Find every open tab that should
                     * disappear because of this deletion.
                     *
                     * For a file:
                     *   remove that file.
                     *
                     * For a folder:
                     *   remove the folder and every
                     *   descendant file/folder tab.
                     */
                    const deletedIds =
                        new Set<string>();

                    deletedIds.add(
                        file.id,
                    );

                    if (
                        file.type ===
                        "folder"
                    ) {
                        let changed =
                            true;

                        while (changed) {
                            changed =
                                false;

                            for (const item of files) {
                                if (
                                    item.parentId &&
                                    deletedIds.has(
                                        item.parentId,
                                    ) &&
                                    !deletedIds.has(
                                        item.id,
                                    )
                                ) {
                                    deletedIds.add(
                                        item.id,
                                    );

                                    changed =
                                        true;
                                }
                            }
                        }
                    }

                    const remainingOpenFiles =
                        openFiles.filter(
                            (openFile) =>
                                !deletedIds.has(
                                    openFile.id,
                                ),
                        );

                    /*
                     * If the active tab was deleted,
                     * choose the next available tab.
                     */
                    if (
                        activeFileId &&
                        deletedIds.has(
                            activeFileId,
                        )
                    ) {
                        const deletedIndex =
                            openFiles.findIndex(
                                (
                                    openFile,
                                ) =>
                                    openFile.id ===
                                    activeFileId,
                            );

                        const nextFile =
                            openFiles
                                .slice(
                                    deletedIndex +
                                    1,
                                )
                                .find(
                                    (
                                        openFile,
                                    ) =>
                                        !deletedIds.has(
                                            openFile.id,
                                        ),
                                ) ??
                            openFiles
                                .slice(
                                    0,
                                    deletedIndex,
                                )
                                .reverse()
                                .find(
                                    (
                                        openFile,
                                    ) =>
                                        !deletedIds.has(
                                            openFile.id,
                                        ),
                                ) ??
                            null;

                        setActiveFileId(
                            nextFile?.id ??
                            null,
                        );
                    }

                    setOpenFiles(
                        remainingOpenFiles,
                    );

                    if (
                        deletedIds.has(
                            selectedFolderId ??
                            "",
                        )
                    ) {
                        setSelectedFolderId(
                            null,
                        );
                    }

                    setExpandedFolders(
                        (current) => {
                            const next =
                                new Set(
                                    current,
                                );

                            for (const id of deletedIds) {
                                next.delete(
                                    id,
                                );
                            }

                            return next;
                        },
                    );

                    setDialog(null);
                },
                onError: () => {
                    window.alert(
                        "Failed to delete item.",
                    );
                },
            },
        );
    }

    function handleCloseFile(
        fileId: string,
    ) {
        const file =
            openFiles.find(
                (item) =>
                    item.id ===
                    fileId,
            );

        if (!file) {
            return;
        }

        if (
            file.content !==
            file.savedContent
        ) {
            const shouldClose =
                window.confirm(
                    `"${file.name}" has unsaved changes. Are you sure you want to close it?`,
                );

            if (!shouldClose) {
                return;
            }
        }

        const index =
            openFiles.findIndex(
                (item) =>
                    item.id ===
                    fileId,
            );

        const nextFile =
            openFiles[index + 1] ??
            openFiles[index - 1] ??
            null;

        setOpenFiles(
            (current) =>
                current.filter(
                    (item) =>
                        item.id !==
                        fileId,
                ),
        );

        if (
            activeFileId === fileId
        ) {
            setActiveFileId(
                nextFile?.id ??
                null,
            );
        }
    }

    function getCreationParentId(): string | null {
        if (
            selectedFolderId
        ) {
            return selectedFolderId;
        }

        if (
            activeFileId
        ) {
            const activeFileForCreation =
                files.find(
                    (file) =>
                        file.id ===
                        activeFileId,
                );

            if (
                activeFileForCreation
            ) {
                return (
                    activeFileForCreation.parentId ??
                    null
                );
            }
        }

        return null;
    }

    function openCreateDialog(
        type:
            | "file"
            | "folder",
        parentId?: string | null,
    ) {
        const resolvedParentId =
            parentId !==
                undefined
                ? parentId
                : getCreationParentId();

        setCreationParentId(
            resolvedParentId,
        );

        setNewItemType(type);

        setNewItemName("");

        setCreateError(null);

        setContextMenu(null);
    }

    function closeCreateDialog() {
        if (
            createFileMutation.isPending ||
            createFolderMutation.isPending
        ) {
            return;
        }

        setNewItemType(null);

        setNewItemName("");

        setCreateError(null);

        setCreationParentId(
            null,
        );
    }

    function getCreationLocationName() {
        if (
            !creationParentId
        ) {
            return "project root";
        }

        const parentFolder =
            files.find(
                (file) =>
                    file.id ===
                    creationParentId &&
                    file.type ===
                    "folder",
            );

        return (
            parentFolder?.name ??
            "selected folder"
        );
    }

    function handleCreate() {
        if (
            !newItemType
        ) {
            return;
        }

        const name =
            newItemName.trim();

        if (!name) {
            setCreateError(
                "Name cannot be empty.",
            );

            return;
        }

        const parentId =
            creationParentId;

        setCreateError(null);

        /*
         * CREATE FILE
         */
        if (
            newItemType ===
            "file"
        ) {
            createFileMutation.mutate(
                {
                    projectId,
                    name,
                    parentId,
                    content: "",
                },
                {
                    onSuccess: (
                        response,
                    ) => {
                        setNewItemType(
                            null,
                        );

                        setNewItemName(
                            "",
                        );

                        setCreationParentId(
                            null,
                        );

                        /*
                         * Opening a newly created file
                         * is handled by the normal active
                         * file/query flow.
                         */
                        setActiveFileId(
                            response.file.id,
                        );

                        setSelectedFolderId(
                            null,
                        );

                        if (
                            parentId
                        ) {
                            setExpandedFolders(
                                (
                                    current,
                                ) => {
                                    const next =
                                        new Set(
                                            current,
                                        );

                                    next.add(
                                        parentId,
                                    );

                                    return next;
                                },
                            );
                        }
                    },

                    onError: (
                        error,
                    ) => {
                        if (
                            error instanceof
                            Error &&
                            error.message.includes(
                                "FILE_NAME_EXISTS",
                            )
                        ) {
                            setCreateError(
                                "A file or folder with this name already exists.",
                            );
                        } else {
                            setCreateError(
                                "Failed to create file.",
                            );
                        }
                    },
                },
            );

            return;
        }

        /*
         * CREATE FOLDER
         */
        createFolderMutation.mutate(
            {
                projectId,
                name,
                parentId,
            },
            {
                onSuccess: (
                    response,
                ) => {
                    setNewItemType(
                        null,
                    );

                    setNewItemName(
                        "",
                    );

                    setCreationParentId(
                        null,
                    );

                    setSelectedFolderId(
                        response.file.id,
                    );

                    setExpandedFolders(
                        (
                            current,
                        ) => {
                            const next =
                                new Set(
                                    current,
                                );

                            if (
                                parentId
                            ) {
                                next.add(
                                    parentId,
                                );
                            }

                            next.add(
                                response
                                    .file
                                    .id,
                            );

                            return next;
                        },
                    );
                },

                onError: (
                    error,
                ) => {
                    if (
                        error instanceof
                        Error &&
                        error.message.includes(
                            "FILE_NAME_EXISTS",
                        )
                    ) {
                        setCreateError(
                            "A file or folder with this name already exists.",
                        );
                    } else {
                        setCreateError(
                            "Failed to create folder.",
                        );
                    }
                },
            },
        );
    }

    function handleContextMenu(
        event: React.MouseEvent,
        file: ProjectFile,
    ) {
        event.preventDefault();
        event.stopPropagation();

        const parentId =
            file.type ===
                "folder"
                ? file.id
                : file.parentId;

        if (
            file.type ===
            "folder"
        ) {
            setSelectedFolderId(
                file.id,
            );
        } else {
            setActiveFileId(
                file.id,
            );

            setSelectedFolderId(
                null,
            );
        }

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            parentId,
            fileId: file.id,
        });
    }

    function handleRootContextMenu(
        event: React.MouseEvent,
    ) {
        event.preventDefault();
        event.stopPropagation();

        setSelectedFolderId(
            null,
        );

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            parentId: null,
        });
    }

    function handleMoveFile(
        fileId: string,
        parentId: string | null,
    ) {
        const file =
            files.find(
                (item) =>
                    item.id ===
                    fileId,
            );

        if (!file) {
            return;
        }

        /*
         * Already in this location.
         */
        if (
            file.parentId ===
            parentId
        ) {
            return;
        }

        /*
         * Prevent moving a folder into itself.
         */
        if (
            file.id ===
            parentId
        ) {
            return;
        }

        /*
         * Prevent moving a folder into one
         * of its descendants.
         */
        if (
            file.type ===
            "folder" &&
            parentId
        ) {
            let currentFile =
                files.find(
                    (item) =>
                        item.id ===
                        parentId,
                );

            while (
                currentFile?.parentId
            ) {
                if (
                    currentFile.parentId ===
                    file.id
                ) {
                    window.alert(
                        "A folder cannot be moved into one of its own subfolders.",
                    );

                    return;
                }

                currentFile =
                    files.find(
                        (item) =>
                            item.id ===
                            currentFile?.parentId,
                    );
            }
        }

        updateFileMutation.mutate(
            {
                projectId,
                fileId,
                parentId,
            },
            {
                onError: (
                    error: any,
                ) => {
                    if (
                        error?.response
                            ?.status ===
                        409
                    ) {
                        window.alert(
                            "A file or folder with this name already exists in the destination.",
                        );

                        return;
                    }

                    window.alert(
                        "Failed to move item.",
                    );
                },
            },
        );
    }

    /*
     * Ctrl+S / Cmd+S
     */
    useEffect(() => {
        function handleKeyDown(
            event: KeyboardEvent,
        ) {
            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() ===
                "s"
            ) {
                event.preventDefault();

                handleSave();
            }
        }

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );
        };
    }, [
        activeFileId,
        openFiles,
        updateFileMutation.isPending,
    ]);

    const isCreating =
        createFileMutation.isPending ||
        createFolderMutation.isPending;

    return (
        <main className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
            {/* Top Bar */}
            <header className="flex h-12 shrink-0 items-center border-b border-zinc-800 bg-zinc-950">
                <div className="flex h-full items-center border-r border-zinc-800 px-4">
                    <Link
                        href="/dashboard"
                        className="text-sm font-semibold tracking-tight text-zinc-200 transition hover:text-white"
                    >
                        Mesh
                    </Link>
                </div>

                <div className="flex min-w-0 flex-1 items-center px-4">
                    <span className="truncate text-sm text-zinc-400">
                        Project
                    </span>

                    <span className="mx-2 text-zinc-700">/</span>

                    <span className="truncate text-sm font-medium text-zinc-200">
                        {projectId}
                    </span>
                </div>

                <div className="flex items-center gap-3 px-4">
                    <AddCollaboratorsDialog projectId={projectId} />

                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />

                        <span className="text-xs text-zinc-500">
                            Connected
                        </span>
                    </div>
                </div>
            </header>

            {/* Workspace */}
            <div className="flex min-h-0 flex-1">
                {/* Explorer */}
                <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
                    <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            Explorer
                        </span>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                title={
                                    selectedFolderId
                                        ? "New File in selected folder"
                                        : "New File"
                                }
                                onClick={() =>
                                    openCreateDialog(
                                        "file",
                                    )
                                }
                                className="flex h-6 w-6 items-center justify-center rounded text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                            >
                                +
                            </button>

                            <button
                                type="button"
                                title={
                                    selectedFolderId
                                        ? "New Folder in selected folder"
                                        : "New Folder"
                                }
                                onClick={() =>
                                    openCreateDialog(
                                        "folder",
                                    )
                                }
                                className="flex h-6 w-6 items-center justify-center rounded text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                            >
                                📁
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <FileTree
                            files={files}
                            filesByParent={filesByParent}
                            expandedFolders={expandedFolders}
                            selectedFileId={activeFileId}
                            selectedFolderId={selectedFolderId}
                            isLoading={filesQuery.isLoading}
                            isError={filesQuery.isError}
                            onToggleFolder={toggleFolder}
                            onSelectFile={handleSelectFile}
                            onSelectFolder={handleSelectFolder}
                            onClearSelection={clearExplorerSelection}
                            onContextMenu={handleContextMenu}
                            onRootContextMenu={handleRootContextMenu}
                            onMoveFile={handleMoveFile}
                        />
                    </div>

                    {/* GitHub Repository */}
                    {/* <div className="max-h-80 shrink-0 overflow-y-auto border-t border-zinc-800">
                        <GithubRepositoryBrowser projectId={projectId} />
                    </div> */}
                </aside>

                {/* Main Editor Area */}
                <section className="flex min-w-0 flex-1 flex-col">
                    {/* Tabs */}
                    <div className="relative h-10 shrink-0 border-b border-zinc-800 bg-zinc-900/30">
                        {/* Tabs */}
                        <div className="flex h-full items-center overflow-x-auto pr-12">
                            {openFiles.length === 0 && (
                                <div className="flex h-full shrink-0 items-center border-r border-zinc-800 bg-zinc-950 px-4">
                                    <span className="text-xs text-zinc-500">
                                        Welcome
                                    </span>
                                </div>
                            )}

                            {openFiles.map((file) => {
                                const isActive =
                                    file.id === activeFileId;

                                const isDirty =
                                    file.content !==
                                    file.savedContent;

                                return (
                                    <div
                                        key={file.id}
                                        className={`group flex h-full shrink-0 items-center border-r border-zinc-800 ${isActive
                                            ? "bg-zinc-950"
                                            : "bg-zinc-900/40"
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setActiveFileId(
                                                    file.id,
                                                )
                                            }
                                            className={`flex h-full items-center px-3 text-xs transition ${isActive
                                                ? "text-zinc-200"
                                                : "text-zinc-500 hover:text-zinc-300"
                                                }`}
                                        >
                                            {isDirty && (
                                                <span className="mr-2 text-zinc-400">
                                                    ●
                                                </span>
                                            )}

                                            <span className="max-w-40 truncate">
                                                {file.name}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="mr-2 flex h-5 w-5 items-center justify-center rounded text-zinc-600 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
                                            aria-label={`Close ${file.name}`}
                                            onClick={() =>
                                                handleCloseFile(
                                                    file.id,
                                                )
                                            }
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Fixed Run Buttons */}
                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                            {/* Run active JavaScript/Python file in Terminal */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (!activeOpenFile) {
                                        return;
                                    }

                                    setRunCommand({
                                        fileName: activeOpenFile.name,
                                        content: activeOpenFile.content,
                                    });

                                    setTerminalOpen(true);
                                }}
                                disabled={
                                    !activeOpenFile ||
                                    !/\.(js|py)$/i.test(activeOpenFile.name)
                                }
                                title={
                                    activeOpenFile
                                        ? /\\.(js|py)$/i.test(activeOpenFile.name)
                                            ? `Run ${activeOpenFile.name}`
                                            : "Run File supports JavaScript and Python"
                                        : "Select a JavaScript or Python file"
                                }
                                className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-400 shadow-sm transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                <span>▶</span>
                                <span>File</span>
                            </button>

                            {/* Run complete React/web project in WebContainer */}
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewOpen(true);
                                }}
                                disabled={files.length === 0}
                                title={
                                    files.length > 0
                                        ? "Run project"
                                        : "Create a project file first"
                                }
                                className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-400 shadow-sm transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                <span>▶</span>
                                <span>Project</span>
                            </button>
                        </div>
                    </div>

                    {/* Editor */}
                    <div className="min-h-0 flex-1 overflow-auto bg-zinc-950">
                        {!activeFileId && (
                            <div className="flex h-full items-center justify-center">
                                <div className="text-center">
                                    <h1 className="text-sm font-medium text-zinc-400">
                                        Mesh Workspace
                                    </h1>

                                    <p className="mt-2 text-xs text-zinc-600">
                                        Select a file from
                                        the Explorer to
                                        start editing.
                                    </p>
                                </div>
                            </div>
                        )}

                        {activeFileId &&
                            selectedFileQuery.isLoading && (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-xs text-zinc-600">
                                        Loading file...
                                    </p>
                                </div>
                            )}

                        {activeFileId &&
                            selectedFileQuery.isError && (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-xs text-red-400">
                                        Failed to load file
                                    </p>
                                </div>
                            )}

                        {activeOpenFile && (
                            <CodeEditor
                                path={`file:///${activeOpenFile.id}/${activeOpenFile.name}`}
                                value={activeOpenFile.content}
                                language={getLanguageFromFileName(
                                    activeOpenFile.name,
                                )}
                                onChange={(value) => {
                                    const nextContent = value ?? "";

                                    setOpenFiles((current) =>
                                        current.map((file) =>
                                            file.id === activeOpenFile.id
                                                ? {
                                                    ...file,
                                                    content: nextContent,
                                                }
                                                : file,
                                        ),
                                    );

                                    const activeFile = files.find(
                                        (file) =>
                                            file.id === activeOpenFile.id,
                                    );

                                    if (
                                        activeFile &&
                                        activeFile.type === "file"
                                    ) {
                                        try {
                                            const path =
                                                getProjectFilePath(
                                                    activeFile.id,
                                                    files,
                                                );

                                            const existingTimer =
                                                previewSyncTimers.current[
                                                activeOpenFile.id
                                                ];

                                            if (existingTimer) {
                                                clearTimeout(existingTimer);
                                            }

                                            previewSyncTimers.current[
                                                activeOpenFile.id
                                            ] = setTimeout(() => {
                                                void previewRef.current
                                                    ?.syncFile(
                                                        path,
                                                        nextContent,
                                                    )
                                                    .catch((error) => {
                                                        console.error(
                                                            "Failed to sync file to preview:",
                                                            error,
                                                        );
                                                    });
                                            }, 200);
                                        } catch (error) {
                                            console.error(
                                                "Failed to prepare file sync:",
                                                error,
                                            );
                                        }
                                    }
                                }}
                            />
                        )}
                    </div>

                    {/* Terminal */}
                    {terminalOpen && (
                        <div className="h-64 shrink-0 border-t border-zinc-800 bg-zinc-950">
                            <Terminal
                                onClose={() =>
                                    setTerminalOpen(false)
                                }
                                runCommand={runCommand}
                            />
                        </div>
                    )}
                </section>

                {/* Right Panel */}
                {/* <GitHubPanel projectId={projectId} /> */}
                {previewOpen && (
                    <aside className="hidden w-[45%] min-w-[420px] shrink-0 border-l border-zinc-800 bg-zinc-950 lg:flex">
                        <ReactPreview
                            ref={previewRef}
                            projectId={projectId}
                            files={files}
                            openFiles={openFiles}
                            isOpen={previewOpen}
                        />
                    </aside>
                )}
            </div>

            {/* Status Bar */}
            <footer className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/70 px-3 text-[10px] text-zinc-500">
                <div className="flex items-center gap-4">
                    <span>
                        main
                    </span>

                    <span>
                        {updateFileMutation.isPending
                            ? "Saving..."
                            : deleteFileMutation.isPending
                                ? "Deleting..."
                                : activeFileHasUnsavedChanges
                                    ? "Unsaved changes"
                                    : "Ready"}
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <span>
                        Ln 1, Col 1
                    </span>

                    <span>
                        UTF-8
                    </span>

                    <span>
                        {getLanguageFromFileName(
                            activeOpenFile?.name ??
                            "",
                        )}
                    </span>
                </div>
            </footer>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    data-context-menu
                    className="fixed z-[60] w-44 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-2xl"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y,
                    }}
                    onMouseDown={(
                        event,
                    ) =>
                        event.stopPropagation()
                    }
                    onClick={(
                        event,
                    ) =>
                        event.stopPropagation()
                    }
                >
                    {contextMenu.fileId && (
                        <>
                            <div className="my-1 border-t border-zinc-800" />

                            <button
                                type="button"
                                onClick={
                                    handleRename
                                }
                                disabled={
                                    updateFileMutation.isPending ||
                                    deleteFileMutation.isPending
                                }
                                className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="mr-2">
                                    ✏
                                </span>

                                Rename
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (
                                        !contextMenu?.fileId
                                    ) {
                                        return;
                                    }

                                    setDialog(
                                        {
                                            type: "move",
                                            fileId:
                                                contextMenu.fileId,
                                        },
                                    );

                                    setContextMenu(
                                        null,
                                    );
                                }}
                                disabled={
                                    updateFileMutation.isPending ||
                                    deleteFileMutation.isPending
                                }
                                className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="mr-2">
                                    ↗
                                </span>

                                Move to...
                            </button>

                            <button
                                type="button"
                                onClick={
                                    handleDelete
                                }
                                disabled={
                                    updateFileMutation.isPending ||
                                    deleteFileMutation.isPending
                                }
                                className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-red-400 transition hover:bg-zinc-800 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="mr-2">
                                    🗑
                                </span>

                                Delete
                            </button>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            openCreateDialog(
                                "file",
                                contextMenu.parentId,
                            )
                        }
                        className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                    >
                        <span className="mr-2">
                            📄
                        </span>

                        New File
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            openCreateDialog(
                                "folder",
                                contextMenu.parentId,
                            )
                        }
                        className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                    >
                        <span className="mr-2">
                            📁
                        </span>

                        New Folder
                    </button>
                </div>
            )}

            {/* Create Dialog */}
            {newItemType && (
                <CreateItemDialog
                    type={newItemType}
                    name={newItemName}
                    error={createError}
                    locationName={getCreationLocationName()}
                    isCreating={isCreating}
                    onNameChange={
                        setNewItemName
                    }
                    onCreate={
                        handleCreate
                    }
                    onClose={
                        closeCreateDialog
                    }
                />
            )}

            {/* Rename / Move / Delete Dialog */}
            {dialog &&
                (() => {
                    const file =
                        files.find(
                            (item) =>
                                item.id ===
                                dialog.fileId,
                        );

                    if (!file) {
                        return null;
                    }

                    return (
                        <WorkspaceDialog
                            type={
                                dialog.type
                            }
                            itemName={
                                file.name
                            }
                            itemType={
                                file.type
                            }
                            itemId={
                                file.id
                            }
                            currentParentId={
                                file.parentId
                            }
                            folders={files.filter(
                                (
                                    item,
                                ) =>
                                    item.type ===
                                    "folder",
                            )}
                            onCancel={() =>
                                setDialog(
                                    null,
                                )
                            }
                            onConfirm={
                                handleDialogConfirm
                            }
                            isLoading={
                                dialog.type ===
                                    "rename" ||
                                    dialog.type ===
                                    "move"
                                    ? updateFileMutation.isPending
                                    : deleteFileMutation.isPending
                            }
                        />
                    );
                })()}
        </main>
    );
}