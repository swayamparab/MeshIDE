"use client";

import Editor, { BeforeMount } from "@monaco-editor/react";

interface CodeEditorProps {
    value: string;
    language: string;
    path?: string; // Accept the file path/name
    onChange?: (value: string | undefined) => void;
}

export default function CodeEditor({
    value,
    language,
    path,
    onChange,
}: CodeEditorProps) {
    const handleEditorMount: BeforeMount = (monaco) => {
        // 1. Disable diagnostic errors for TS and JS
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
            onlyShowReferencedErrors: false,
        });

        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
            onlyShowReferencedErrors: false,
        });

        // 2. Enable JSX and latest module resolution
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            allowNonTextExtensions: true,
            target: monaco.languages.typescript.ScriptTarget.Latest,
            moduleResolution:
                monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            allowJs: true,
        });
    };

    return (
        <Editor
            height="100%"
            theme="vs-dark"
            path={path ?? "file:///index.tsx"} // Provides a persistent model URI
            language={language}
            value={value}
            beforeMount={handleEditorMount}
            onChange={onChange}
            options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: "on",
                wordWrap: "off",
                automaticLayout: true,
                tabSize: 4,
                padding: { top: 12 },
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
            }}
        />
    );
}