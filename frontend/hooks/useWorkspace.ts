"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    useCreateFile,
    useCreateFolder,
    useProjectFiles,
} from "@/hooks/project/useProjectFiles";

import {
    useFile,
    useUpdateFile,
    useDeleteFile,
} from "@/hooks/file/useFile";

import type { ProjectFile } from "@/services/file";
import type { ReactPreviewHandle } from "@/components/preview/ReactPreview";
import { getProjectFilePath } from "@/lib/webcontainer/webcontainer-files";
import { socket } from "@/lib/socket";
import { useFileEvents } from "./events/useFileEvents";

export interface OpenFile {
    id: string;
    name: string;
    content: string;
    savedContent: string;
}

export function useWorkspace(projectId: string) {
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

    useFileEvents(projectId);

    useEffect(() => {
        const handleContentUpdate = (data: {
            projectId: string;
            fileId: string;
            content: string;
            userId: string;
        }) => {
            if (data.projectId !== projectId) return;

            setOpenFiles((current) =>
                current.map((file) => {
                    if (file.id !== data.fileId) {
                        return file;
                    }

                    // Do not overwrite local unsaved changes.
                    if (file.content !== file.savedContent) {
                        return file;
                    }

                    return {
                        ...file,
                        content: data.content,
                        savedContent: data.content,
                    };
                }),
            );
        };

        socket.on("file:content-updated", handleContentUpdate);

        return () => {
            socket.off("file:content-updated", handleContentUpdate);
        };
    }, [projectId]);

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

    /*
 * Join the Socket.IO room for the current project.
 */
    useEffect(() => {
        if (!projectId) {
            return;
        }

        const joinProject = () => {
            socket.emit("project:join", projectId);
        };

        const handleJoinError = (data: { message: string }) => {
            window.alert(data.message);
        };

        socket.on("project:join:error", handleJoinError);

        if (socket.connected) {
            joinProject();
        } else {
            socket.once("connect", joinProject);
        }

        return () => {
            socket.off("connect", joinProject);
            socket.off("project:join:error", handleJoinError);

            if (socket.connected) {
                socket.emit("project:leave", projectId);
            }
        };
    }, [projectId]);

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

    function handleSave(content?: string) {
        if (
            !activeOpenFile ||
            updateFileMutation.isPending
        ) {
            return;
        }

        const contentToSave =
            content ?? activeOpenFile.content;

        if (
            contentToSave ===
            activeOpenFile.savedContent
        ) {
            return;
        }

        updateFileMutation.mutate(
            {
                projectId,
                fileId: activeOpenFile.id,
                content: contentToSave,
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
                                                contentToSave,
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

    function handleMove() {
        if (!contextMenu?.fileId) {
            return;
        }

        setDialog({
            type: "move",
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

    function handleEditorChange(value: string | undefined) {
        if (!activeOpenFile) return;
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
            (file) => file.id === activeOpenFile.id,
        );

        if (activeFile && activeFile.type === "file") {
            try {
                const path = getProjectFilePath(
                    activeFile.id,
                    files,
                );

                const existingTimer =
                    previewSyncTimers.current[activeOpenFile.id];

                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                previewSyncTimers.current[activeOpenFile.id] = setTimeout(() => {
                    void previewRef.current
                        ?.syncFile(path, nextContent)
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
    }

    const isCreating =
        createFileMutation.isPending ||
        createFolderMutation.isPending;

    return {
        activeFileId,
        setActiveFileId,
        openFiles,
        selectedFolderId,
        expandedFolders,
        newItemType,
        newItemName,
        setNewItemName,
        createError,
        contextMenu,
        dialog,
        setDialog,
        terminalOpen,
        setTerminalOpen,
        previewOpen,
        setPreviewOpen,
        runCommand,
        setRunCommand,
        previewRef,
        filesQuery,
        selectedFileQuery,
        updateFileMutation,
        deleteFileMutation,
        files,
        activeOpenFile,
        activeFileHasUnsavedChanges,
        filesByParent,
        isCreating,
        toggleFolder,
        handleSelectFolder,
        clearExplorerSelection,
        handleSelectFile,
        handleSave,
        handleRename,
        handleMove,
        handleDelete,
        handleDialogConfirm,
        handleCloseFile,
        openCreateDialog,
        closeCreateDialog,
        getCreationLocationName,
        handleCreate,
        handleContextMenu,
        handleRootContextMenu,
        handleMoveFile,
        handleEditorChange,
    };
}