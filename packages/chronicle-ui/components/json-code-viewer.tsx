"use client"

import Editor, { type OnMount } from "@monaco-editor/react"

type JsonCodeViewerProps = {
  value: string
  height?: number | string
  emptyText?: string
}

export function JsonCodeViewer({
  value,
  height = 224,
  emptyText = "No JSON selected.",
}: JsonCodeViewerProps) {
  const handleMount: OnMount = (_editor, monaco) => {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: false,
    })
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <Editor
        height={height}
        defaultLanguage="json"
        language="json"
        theme="vs"
        value={value || emptyText}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          contextmenu: false,
          domReadOnly: true,
          folding: true,
          fontFamily:
            "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          overviewRulerBorder: false,
          readOnly: true,
          renderLineHighlight: "none",
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />
    </div>
  )
}
