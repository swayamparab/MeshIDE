"use client";

import Editor, {
    BeforeMount,
    OnMount,
} from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";

interface CodeEditorProps {
    language: string;
    path?: string;
    yText: Y.Text;
    onChange?: (
        value: string | undefined,
    ) => void;
}

export default function CodeEditor({
    language,
    path,
    yText,
    onChange
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

        // console.log(
        //     "Y.Text content before Monaco binding:",
        //     yText.toString(),
        // );

        const binding =
            new MonacoBinding(
                yText,
                model,
                new Set([editor]),
            );

        return () => {
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