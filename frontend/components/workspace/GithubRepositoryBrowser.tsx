"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  File,
  Folder,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { useGithubRepositoryContents } from "@/hooks/useGithubRepository";

interface GithubRepositoryBrowserProps {
  projectId: string;
}

export default function GithubRepositoryBrowser({
  projectId,
}: GithubRepositoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");

  const {
    data: contents = [],
    isLoading,
    isError,
    refetch,
  } = useGithubRepositoryContents(projectId, currentPath);

  function openFolder(path: string) {
    setCurrentPath(path);
  }

  function goBack() {
    if (!currentPath) {
      return;
    }

    const pathParts = currentPath.split("/");
    pathParts.pop();

    setCurrentPath(pathParts.join("/"));
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-950 text-sm text-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={!currentPath}
            className="rounded p-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
            title="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <span className="truncate font-medium">
            {currentPath || "Repository root"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          className="rounded p-1 hover:bg-zinc-800"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading repository...
          </div>
        )}

        {isError && !isLoading && (
          <div className="space-y-2 px-2 py-8 text-center text-sm text-red-400">
            <p>Unable to load repository contents.</p>

            <button
              type="button"
              onClick={() => refetch()}
              className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && contents.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">
            This directory is empty.
          </p>
        )}

        {!isLoading && !isError && contents.length > 0 && (
          <div className="space-y-1">
            {contents.map((item) => {
              const isFolder = item.type === "dir";

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    if (isFolder) {
                      openFolder(item.path);
                    }
                  }}
                  disabled={!isFolder}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-zinc-800 disabled:cursor-default"
                >
                  {isFolder ? (
                    <Folder className="h-4 w-4 shrink-0 text-yellow-400" />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-zinc-400" />
                  )}

                  <span className="min-w-0 flex-1 truncate">
                    {item.name}
                  </span>

                  {isFolder && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}