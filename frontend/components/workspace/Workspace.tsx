"use client";

import Link from "next/link";
import CodeEditor from "@/components/editor/CodeEditor";
import { getLanguageFromFileName } from "@/lib/editor/language";
import FileTree from "./FileTree";
import CreateItemDialog from "./CreateItemDialog";
import WorkspaceDialog from "./WorkspaceDialog";
import Terminal from "@/components/terminal/Terminal";
import ReactPreview from "@/components/preview/ReactPreview";
import AddCollaboratorsDialog from "./AddCollaboratorsDialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSocket } from "@/providers/SocketProvider";

interface WorkspaceProps {
    projectId: string;
}

export default function Workspace({ projectId }: WorkspaceProps) {
    const {
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
    } = useWorkspace(projectId);

    const { connected } = useSocket();

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
                        <span
                            className={`h-2 w-2 rounded-full ${connected
                                    ? "bg-emerald-500"
                                    : "bg-red-500"
                                }`}
                        />

                        <span className="text-xs text-zinc-500">
                            {connected ? "Connected" : "Disconnected"}
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
                                        ? /\.(js|py)$/i.test(activeOpenFile.name)
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
                                onChange={handleEditorChange}
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
                                onClick={
                                    handleMove
                                }
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