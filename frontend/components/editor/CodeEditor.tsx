"use client";

import Editor, {
    BeforeMount,
    OnMount,
} from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { Awareness } from "y-protocols/awareness";

interface CodeEditorProps {
    language: string;
    path?: string;
    yText: Y.Text;
    awareness: Awareness;
    onChange?: (
        value: string | undefined,
    ) => void;
}

export default function CodeEditor({
    language,
    path,
    yText,
    awareness,
    onChange,
}: CodeEditorProps) {
    const handleEditorBeforeMount: BeforeMount = (
        monaco,
    ) => {
        // Disable diagnostic errors for TS and JS
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
            {
                noSemanticValidation: true,
                noSyntaxValidation: true,
            },
        );

        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(
            {
                noSemanticValidation: true,
                noSyntaxValidation: true,
            },
        );

        // Enable JSX and latest module resolution
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
            {
                jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
                allowNonTextExtensions: true,
                target: monaco.languages.typescript.ScriptTarget.Latest,
                moduleResolution:
                    monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                allowJs: true,
            },
        );
    };

    const handleEditorMount: OnMount = (
        editor,
    ) => {
        const model =
            editor.getModel();

        if (!model) {
            return;
        }

        const binding =
            new MonacoBinding(
                yText,
                model,
                new Set([editor]),
            );

        const remoteDecorationIds = new Map<number, string[]>();

        const updateRemoteCursors = () => {
            const activeClientIds =
                new Set<number>();

            awareness.getStates().forEach(
                (state, clientId) => {
                    if (
                        clientId ===
                        awareness.clientID
                    ) {
                        return;
                    }

                    activeClientIds.add(clientId);

                    const cursor = state.cursor;
                    const selection = state.selection;
                    const user = state.user;

                    const decorations: {
                        range: {
                            startLineNumber: number;
                            startColumn: number;
                            endLineNumber: number;
                            endColumn: number;
                        };
                        options: {
                            className: string;
                        };
                    }[] = [];

                    if (cursor && user) {
                        decorations.push({
                            range: {
                                startLineNumber:
                                    cursor.lineNumber,
                                startColumn:
                                    cursor.column,
                                endLineNumber:
                                    cursor.lineNumber,
                                endColumn:
                                    cursor.column,
                            },
                            options: {
                                className:
                                    "mesh-remote-cursor",
                            },
                        });
                    }

                    if (
                        selection &&
                        (
                            selection.startLineNumber !==
                            selection.endLineNumber ||
                            selection.startColumn !==
                            selection.endColumn
                        )
                    ) {
                        decorations.push({
                            range: {
                                startLineNumber:
                                    selection.startLineNumber,
                                startColumn:
                                    selection.startColumn,
                                endLineNumber:
                                    selection.endLineNumber,
                                endColumn:
                                    selection.endColumn,
                            },
                            options: {
                                className:
                                    "mesh-remote-selection",
                            },
                        });
                    }

                    const previousDecorations =
                        remoteDecorationIds.get(
                            clientId,
                        ) ?? [];

                    const newDecorationIds =
                        editor.deltaDecorations(
                            previousDecorations,
                            decorations,
                        );

                    remoteDecorationIds.set(
                        clientId,
                        newDecorationIds,
                    );
                },
            );

            // Remove decorations for users
            // who are no longer present.
            for (
                const [
                    clientId,
                    decorationIds,
                ] of remoteDecorationIds
            ) {
                if (
                    !activeClientIds.has(
                        clientId,
                    )
                ) {
                    editor.deltaDecorations(
                        decorationIds,
                        [],
                    );

                    remoteDecorationIds.delete(
                        clientId,
                    );
                }
            }
        };

        const handleRemoteAwareness = () => {
            // console.log(
            //     "Remote awareness:",
            //     Array.from(
            //         awareness.getStates().entries(),
            //     ),
            // );

            updateRemoteCursors();
        };

        awareness.on(
            "change",
            handleRemoteAwareness,
        );

        // Render any users already present
        updateRemoteCursors();

        const handleCursorChange = () => {
            const position =
                editor.getPosition();

            const selection =
                editor.getSelection();

            // console.log(
            //     "Setting cursor awareness:",
            //     {
            //         cursor: position
            //             ? {
            //                 lineNumber:
            //                     position.lineNumber,
            //                 column:
            //                     position.column,
            //             }
            //             : null,
            //         selection: selection
            //             ? {
            //                 startLineNumber:
            //                     selection.startLineNumber,
            //                 startColumn:
            //                     selection.startColumn,
            //                 endLineNumber:
            //                     selection.endLineNumber,
            //                 endColumn:
            //                     selection.endColumn,
            //             }
            //             : null,
            //     },
            // );

            awareness.setLocalStateField(
                "cursor",
                position
                    ? {
                        lineNumber:
                            position.lineNumber,
                        column:
                            position.column,
                    }
                    : null,
            );

            awareness.setLocalStateField(
                "selection",
                selection
                    ? {
                        startLineNumber:
                            selection.startLineNumber,
                        startColumn:
                            selection.startColumn,
                        endLineNumber:
                            selection.endLineNumber,
                        endColumn:
                            selection.endColumn,
                    }
                    : null,
            );
        };

        const cursorPositionDisposable =
            editor.onDidChangeCursorPosition(
                handleCursorChange,
            );

        const cursorSelectionDisposable =
            editor.onDidChangeCursorSelection(
                handleCursorChange,
            );

        // Set initial cursor position
        handleCursorChange();

        return () => {
            cursorPositionDisposable.dispose();

            cursorSelectionDisposable.dispose();

            awareness.off(
                "change",
                handleRemoteAwareness,
            );

            for (
                const decorationIds of
                remoteDecorationIds.values()
            ) {
                editor.deltaDecorations(
                    decorationIds,
                    [],
                );
            }
            remoteDecorationIds.clear();

            binding.destroy();
        };
    };

    return (
        <Editor
            height="100%"
            theme="vs-dark"
            path={
                path ??
                "file:///index.tsx"
            }
            language={language}
            beforeMount={
                handleEditorBeforeMount
            }
            onMount={
                handleEditorMount
            }
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