import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FloppyDisk, Download, Spinner, Warning } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";
import { csrfFetch } from "@/lib/csrf";

const EXTENSION_MAP: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  json: "json",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  txt: "plaintext",
  html: "html",
  css: "css",
  sh: "shell",
  bash: "shell",
};

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXTENSION_MAP[ext] || "plaintext";
}

export function ServerFileEditPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [MonacoEditor, setMonacoEditor] = useState<any>(null);

  const filePath = window.location.pathname.split("/files/edit/")[1] || "";
  const fileName = filePath.split("/").pop() || "Unknown";
  const language = getLanguageFromPath(filePath);

  useEffect(() => {
    import("@monaco-editor/react").then((mod) => {
      setMonacoEditor(() => mod.default);
    });
  }, []);

  const fetchFile = useCallback(async () => {
    if (!id || !filePath) return;
    try {
      const res = await fetch(`/server/${id}/files/edit/${filePath}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setContent(data.content || "");
      setOriginalContent(data.content || "");
    } catch {
      setError("Failed to load file content");
    } finally {
      setLoading(false);
    }
  }, [id, filePath]);

  useEffect(() => {
    fetchFile();
  }, [fetchFile]);

  const handleSave = async () => {
    if (!id || !filePath) return;
    setSaving(true);
    try {
      const res = await csrfFetch(`/server/${id}/files/${filePath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setOriginalContent(content);
      toast("File saved", "success");
    } catch {
      toast("Failed to save file", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!id || !filePath) return;
    window.location.href = `/server/${id}/files/download/${filePath}`;
  };

  const pathParts = filePath.split("/").filter(Boolean);

  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col h-full"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/server/${id}/files`}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold text-neutral-900 dark:text-white tracking-tight truncate">
                {fileName}
              </h1>
              <div className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 overflow-hidden">
                {pathParts.map((part, i) => (
                  <span key={i} className="flex items-center gap-1 whitespace-nowrap">
                    {i > 0 && <span>/</span>}
                    <span className={i === pathParts.length - 1 ? "text-neutral-600 dark:text-neutral-300" : ""}>
                      {part}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 text-sm gap-1.5 px-3"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving || content === originalContent}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
            >
              {saving ? <Spinner className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center gap-2">
            <Warning className="size-4 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex-1 bg-[#0a0a0a] rounded-xl border border-neutral-200/30 dark:border-white/[0.07] overflow-hidden min-h-0">
          {loading ? (
            <div className="p-6 animate-pulse space-y-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-3 bg-white/5 rounded w-8" />
                  <div className="h-3 bg-white/5 rounded" style={{ width: `${30 + Math.random() * 60}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full">
              {MonacoEditor ? (
                <MonacoEditor
                  height="100%"
                  language={language}
                  value={content}
                  onChange={(value: string) => setContent(value || "")}
                  theme="vs-dark"
                  options={{
                    fontSize: 13,
                    fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    lineNumbers: "on",
                    renderLineHighlight: "line",
                    bracketPairColorization: { enabled: true },
                    automaticLayout: true,
                  }}
                />
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full bg-transparent text-neutral-100 text-sm font-mono p-4 focus:outline-none resize-none"
                  spellCheck={false}
                />
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
