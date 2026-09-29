"use client";

import { useEffect, useState } from "react";
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { Awareness } from "y-protocols/awareness";
import type * as Monaco from "monaco-editor";

interface CodeEditorProps {
    language: string;
    path?: string;
    yText: Y.Text;
    awareness: Awareness;
    onChange?: (value: string | undefined) => void;
}

export default function CodeEditor({
    language,
    path,
    yText,
    awareness,
    onChange,
}: CodeEditorProps) {
    const [editor, setEditor] =
        useState<Monaco.editor.IStandaloneCodeEditor | null>(null);

    const handleEditorBeforeMount: BeforeMount = (monaco) => {
        // Disable diagnostic errors for TS and JS
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
        });

        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
        });

        // Enable JSX and latest module resolution
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            allowNonTextExtensions: true,
            target: monaco.languages.typescript.ScriptTarget.Latest,
            moduleResolution:
                monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            allowJs: true,
        });
    };

    // onMount only hands us the editor. Everything else happens in effects,
    // because @monaco-editor/react ignores any cleanup returned from onMount.
    const handleEditorMount: OnMount = (mountedEditor) => {
        setEditor(mountedEditor);
    };

    // ---------------------------------------------------------------
    // Effect 1: bind Monaco model <-> Y.Text
    // Re-runs whenever the editor or the Y.Text changes.
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!editor) return;

        const model = editor.getModel();
        if (!model) return;

        const binding = new MonacoBinding(yText, model, new Set([editor]));

        return () => {
            binding.destroy();
        };
    }, [editor, yText]);

    // ---------------------------------------------------------------
    // Effect 2: local cursor broadcast + remote cursors/selections
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!editor) return;

        const remoteDecorationIds = new Map<number, string[]>();
        const remoteCursorLabels = new Map<number, HTMLDivElement>();

        const positionLabel = (
            label: HTMLDivElement,
            cursor: { lineNumber: number; column: number },
        ) => {
            const position = editor.getScrolledVisiblePosition({
                lineNumber: cursor.lineNumber,
                column: cursor.column,
            });

            if (!position) {
                label.style.display = "none";
                return;
            }

            label.style.display = "block";
            label.style.left = `${position.left}px`;
            label.style.top = `${position.top - 22}px`;
        };

        const removeClient = (clientId: number) => {
            const decorationIds = remoteDecorationIds.get(clientId);
            if (decorationIds) {
                editor.deltaDecorations(decorationIds, []);
                remoteDecorationIds.delete(clientId);
            }

            const label = remoteCursorLabels.get(clientId);
            if (label) {
                label.remove();
                remoteCursorLabels.delete(clientId);
            }
        };

        const updateRemoteCursors = () => {
            const activeClientIds = new Set<number>();

            awareness.getStates().forEach((state, clientId) => {
                if (clientId === awareness.clientID) return;

                activeClientIds.add(clientId);

                const cursor = state.cursor;
                const selection = state.selection;
                const user = state.user;

                const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

                if (cursor && user) {
                    decorations.push({
                        range: {
                            startLineNumber: cursor.lineNumber,
                            startColumn: cursor.column,
                            endLineNumber: cursor.lineNumber,
                            endColumn: cursor.column,
                        },
                        options: {
                            className: "mesh-remote-cursor",
                        },
                    });

                    let label = remoteCursorLabels.get(clientId);

                    if (!label) {
                        label = document.createElement("div");
                        label.className = "mesh-remote-cursor-label";
                        remoteCursorLabels.set(clientId, label);
                        editor.getDomNode()?.appendChild(label);
                    }

                    label.textContent = user.name;
                    positionLabel(label, cursor);
                } else {
                    // No cursor for this client: drop any stale label
                    const label = remoteCursorLabels.get(clientId);
                    if (label) {
                        label.remove();
                        remoteCursorLabels.delete(clientId);
                    }
                }

                if (
                    selection &&
                    (selection.startLineNumber !== selection.endLineNumber ||
                        selection.startColumn !== selection.endColumn)
                ) {
                    decorations.push({
                        range: {
                            startLineNumber: selection.startLineNumber,
                            startColumn: selection.startColumn,
                            endLineNumber: selection.endLineNumber,
                            endColumn: selection.endColumn,
                        },
                        options: {
                            className: "mesh-remote-selection",
                        },
                    });
                }

                const previousDecorations =
                    remoteDecorationIds.get(clientId) ?? [];

                remoteDecorationIds.set(
                    clientId,
                    editor.deltaDecorations(previousDecorations, decorations),
                );
            });

            // Remove decorations/labels for users who are no longer present
            for (const clientId of Array.from(remoteDecorationIds.keys())) {
                if (!activeClientIds.has(clientId)) {
                    removeClient(clientId);
                }
            }
        };

        const updateCursorLabelPositions = () => {
            awareness.getStates().forEach((state, clientId) => {
                if (clientId === awareness.clientID) return;

                const cursor = state.cursor;
                const label = remoteCursorLabels.get(clientId);

                if (!cursor || !label) return;

                positionLabel(label, cursor);
            });
        };

        const handleCursorChange = () => {
            const position = editor.getPosition();
            const selection = editor.getSelection();

            awareness.setLocalStateField(
                "cursor",
                position
                    ? {
                          lineNumber: position.lineNumber,
                          column: position.column,
                      }
                    : null,
            );

            awareness.setLocalStateField(
                "selection",
                selection
                    ? {
                          startLineNumber: selection.startLineNumber,
                          startColumn: selection.startColumn,
                          endLineNumber: selection.endLineNumber,
                          endColumn: selection.endColumn,
                      }
                    : null,
            );
        };

        awareness.on("change", updateRemoteCursors);

        const scrollDisposable = editor.onDidScrollChange(
            updateCursorLabelPositions,
        );
        const contentDisposable = editor.onDidChangeModelContent(
            updateCursorLabelPositions,
        );
        const cursorPositionDisposable = editor.onDidChangeCursorPosition(
            handleCursorChange,
        );
        const cursorSelectionDisposable = editor.onDidChangeCursorSelection(
            handleCursorChange,
        );

        // Render users already present, and publish our own cursor
        updateRemoteCursors();
        handleCursorChange();

        return () => {
            awareness.off("change", updateRemoteCursors);

            cursorPositionDisposable.dispose();
            cursorSelectionDisposable.dispose();
            scrollDisposable.dispose();
            contentDisposable.dispose();

            for (const clientId of Array.from(remoteDecorationIds.keys())) {
                removeClient(clientId);
            }

            for (const label of remoteCursorLabels.values()) {
                label.remove();
            }
            remoteCursorLabels.clear();
        };
    }, [editor, awareness]);

    return (
        <Editor
            height="100%"
            theme="vs-dark"
            path={path ?? "file:///index.tsx"}
            language={language}
            beforeMount={handleEditorBeforeMount}
            onMount={handleEditorMount}
            onChange={onChange}
            options={{
                minimap: {
                    enabled: true,
                },
                stickyScroll: {
                    enabled: false,
                },
                fontSize: 14,
                lineNumbers: "on",
                wordWrap: "off",
                automaticLayout: true,
                tabSize: 4,
                padding: {
                    top: 12,
                },
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
            }}
        />
    );
}