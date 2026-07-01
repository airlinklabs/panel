import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  File,
  Upload,
  Plus,
  Trash,
  PencilSimple,
  FileCode,
  FileText,
  FileZip,
  Download,
  MagnifyingGlass,
  X,
  Copy,
  ArrowLeft,
} from "@phosphor-icons/react";
import { cn, formatBytes } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";

interface FileItem {
  name: string;
  type: "file" | "directory";
  size?: number;
  category?: string;
}

export function ServerFilesPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ file: FileItem; x: number; y: number } | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/server/${id}/files?path=${encodeURIComponent(currentPath)}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      toast("Failed to load files", "error");
    } finally {
      setLoading(false);
    }
  }, [id, currentPath, toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (fileList: FileList) => {
    if (!id) return;
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      try {
        const res = await fetch(`/server/${id}/upload`, {
          method: "POST",
          body: formData,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("Upload failed");
      } catch {
        toast(`Failed to upload ${file.name}`, "error");
      }
    }
    toast("Upload complete", "success");
    fetchFiles();
  };

  const handleDelete = async (path: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/files/rm/${path}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast("Deleted successfully", "success");
      fetchFiles();
    } catch {
      toast("Failed to delete", "error");
    }
    setContextMenu(null);
  };

  const handleRename = async (path: string, newName: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, newName }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Rename failed");
      toast("Renamed successfully", "success");
      fetchFiles();
    } catch {
      toast("Failed to rename", "error");
    }
    setRenamingFile(null);
  };

  const handleDownload = (filePath: string) => {
    window.location.href = `/server/${id}/files/download/${filePath}`;
    setContextMenu(null);
  };

  const handleExtractZip = async (name: string, filePath: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/unzip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: currentPath, zipname: name }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Unzip failed");
      toast("Extracted successfully", "success");
      fetchFiles();
    } catch {
      toast("Failed to extract", "error");
    }
    setContextMenu(null);
  };

  const navigateTo = (file: FileItem) => {
    if (file.type === "directory") {
      const newPath = currentPath === "/" ? file.name : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
    } else {
      const filePath = currentPath === "/" ? file.name : `${currentPath}/${file.name}`;
      window.location.href = `/server/${id}/files/edit/${filePath}`;
    }
  };

  const pathParts = currentPath.split("/").filter(Boolean);

  const getFileIcon = (file: FileItem) => {
    if (file.type === "directory") return <Folder className="size-6 text-neutral-400 dark:text-neutral-500 shrink-0 al-file-icon" />;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["js", "ts", "tsx", "jsx", "py", "java", "go", "rs", "json", "yml", "yaml", "toml", "cfg", "conf", "properties"].includes(ext))
      return <FileCode className="size-6 text-neutral-400 dark:text-neutral-500 shrink-0 al-file-icon" />;
    if (["txt", "md", "log"].includes(ext))
      return <FileText className="size-6 text-neutral-400 dark:text-neutral-500 shrink-0 al-file-icon" />;
    if (["zip", "tar", "gz", "7z"].includes(ext))
      return <FileZip className="size-6 text-neutral-400 dark:text-neutral-500 shrink-0 al-file-icon" />;
    return <File className="size-6 text-neutral-400 dark:text-neutral-500 shrink-0 al-file-icon" />;
  };

  const filteredFiles = searchQuery
    ? files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  return (
    <div className="p-6 overflow-y-auto pt-16">
      <div className="sm:flex sm:items-center px-8 pt-4">
        <div className="flex-1">
          <div className="flex items-center">
            <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white truncate max-w-[300px]">
              Files
            </h1>
          </div>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            <Upload className="w-4 h-4 shrink-0" />
            Upload File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>
      </div>

      <div className="px-8 mt-8">
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700/40">
          <div className="px-3 py-2.5 flex items-center overflow-hidden">
            <nav className="flex items-center gap-0 text-xs min-w-0 overflow-hidden">
              <a
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition shrink-0 text-sm"
                href="#"
                onClick={(e) => { e.preventDefault(); setCurrentPath("/"); }}
              >
                /home/container/
              </a>
              {pathParts.map((part, i) => {
                const isLast = i === pathParts.length - 1;
                const partPath = pathParts.slice(0, i + 1).join("/");
                return (
                  <span key={i} className="flex items-center">
                    {!isLast ? (
                      <>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); setCurrentPath(`/${partPath}`); }}
                          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
                        >
                          {part}
                        </a>
                        <span className="text-neutral-300 dark:text-neutral-600 mx-0.5">/</span>
                      </>
                    ) : (
                      <span className="text-neutral-700 dark:text-neutral-200 font-medium">{part}</span>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>

          <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-700/30 flex items-center gap-2">
            <MagnifyingGlass size={14} className="text-neutral-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files…"
              className="flex-1 bg-transparent text-sm text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 rounded transition"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <table className="min-w-full bg-white dark:bg-neutral-900/60">
            <thead className="border-b border-neutral-200 dark:border-neutral-700/40">
              <tr>
                <th className="px-4 py-2.5 text-left w-10" />
                <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500 dark:text-neutral-500">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500 dark:text-neutral-500 w-24">Size</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500 dark:text-neutral-500 w-32 hidden md:table-cell">Modified</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-100 dark:border-neutral-700/30">
                    <td className="px-4 py-3 w-10" />
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 animate-pulse">
                        <div className="size-6 bg-neutral-200 dark:bg-white/10 rounded" />
                        <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded w-1/3" />
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="h-3 bg-neutral-200 dark:bg-white/10 rounded w-12 animate-pulse" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 bg-neutral-200 dark:bg-white/10 rounded w-16 animate-pulse" /></td>
                  </tr>
                ))
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <Folder className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {searchQuery ? "No files match your search" : "This folder is empty"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file, index) => {
                  const filePath = currentPath === "/" ? file.name : `${currentPath}/${file.name}`;
                  const fileSize = (() => {
                    const sizes = ["Bytes", "KB", "MB", "GB"];
                    let size = file.size || 0;
                    let unitIndex = 0;
                    while (size >= 1024 && unitIndex < sizes.length - 1) {
                      size /= 1024;
                      unitIndex++;
                    }
                    return `${size.toFixed(2)} ${sizes[unitIndex]}`;
                  })();

                  return (
                    <tr
                      key={file.name}
                      className="al-file-row hover:bg-neutral-100 dark:hover:bg-white/5 border-b border-neutral-100 dark:border-neutral-700/30 last:border-0 cursor-pointer transition-colors duration-150"
                      style={{ animationDelay: `${Math.min(index, 10) * 18}ms` }}
                      onClick={() => navigateTo(file)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ file, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <td className="px-4 py-3 w-10" />
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-200 transition-colors">
                          {getFileIcon(file)}
                          <span className="truncate">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                        {file.type === "directory" ? "—" : fileSize}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap hidden md:table-cell">
                        <span className="text-neutral-300 dark:text-neutral-600">—</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-50 w-44 rounded-xl overflow-hidden bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 shadow-lg"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <div className="py-1">
                <button
                  onClick={() => {
                    setRenamingFile(contextMenu.file.name);
                    setRenameValue(contextMenu.file.name);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <PencilSimple size={14} className="shrink-0" />
                  Rename
                </button>
                <button
                  onClick={() => {
                    const fp = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                    navigator.clipboard.writeText(fp);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <Copy size={14} className="shrink-0" />
                  Copy Path
                </button>
                {contextMenu.file.type !== "directory" && (
                  <button
                    onClick={() => {
                      const fp = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                      handleDownload(fp);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <Download size={14} className="shrink-0" />
                    Download
                  </button>
                )}
                {contextMenu.file.name.toLowerCase().endsWith(".zip") && (
                  <button
                    onClick={() => {
                      const fp = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                      handleExtractZip(contextMenu.file.name, fp);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <FileZip size={14} className="shrink-0" />
                    Extract Here
                  </button>
                )}
                <div className="mx-2 my-1 border-t border-neutral-100 dark:border-neutral-700/60" />
                <button
                  onClick={() => {
                    const fp = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                    handleDelete(fp);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash size={14} className="shrink-0" />
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {renamingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-neutral-800 rounded-2xl w-full max-w-md border border-neutral-200 dark:border-neutral-700/40 shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-700/60">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Rename</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Use / to move the file into a different folder.</p>
              </div>
              <button onClick={() => setRenamingFile(null)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 transition">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) handleRename(renamingFile, renameValue);
                  if (e.key === "Escape") setRenamingFile(null);
                }}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 font-mono transition"
                placeholder="new-name.txt or subfolder/new-name.txt"
              />
            </div>
            <div className="flex gap-2 px-5 pb-5 justify-end">
              <button onClick={() => setRenamingFile(null)} className="px-4 py-2 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition active:scale-95">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (renameValue.trim()) handleRename(renamingFile, renameValue);
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition active:scale-95"
              >
                Rename
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
