import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  File,
  Upload,
  Plus,
  Trash,
  PencilSimple,
  ArrowRight,
  ArrowLeft,
  FileCode,
  FileText,
  FileJson,
  FileZip,
  X,
  FunnelSimple,
  DotsThreeVertical,
  Download,
  CheckSquare,
} from "@phosphor-icons/react";
import { cn, formatBytes } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";

interface FileItem {
  name: string;
  type: "file" | "directory";
  size?: number;
}

export function ServerFilesPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("/");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
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

  const handleCreateFolder = async () => {
    if (!id || !newFolderName.trim()) return;
    const path = currentPath === "/" ? newFolderName : `${currentPath}/${newFolderName}`;
    try {
      const res = await fetch(`/server/${id}/files/rm/${path}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      // Create folder by attempting to create a .airlink_keep file
      setShowNewFolder(false);
      setNewFolderName("");
      fetchFiles();
    } catch {
      toast("Failed to create folder", "error");
    }
  };

  const handleZip = async (path: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: path, zipname: path.split("/").pop() + ".zip" }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Zip failed");
      toast("Zipped successfully", "success");
      fetchFiles();
    } catch {
      toast("Failed to zip", "error");
    }
    setContextMenu(null);
  };

  const handleUnzip = async (path: string) => {
    if (!id) return;
    const dir = path.replace(/\.zip$/, "");
    try {
      const res = await fetch(`/server/${id}/unzip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: currentPath, zipname: path.split("/").pop() }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Unzip failed");
      toast("Unzipped successfully", "success");
      fetchFiles();
    } catch {
      toast("Failed to unzip", "error");
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
    if (file.type === "directory") return <Folder className="size-4 text-amber-500" />;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["js", "ts", "tsx", "jsx", "py", "java", "go", "rs"].includes(ext))
      return <FileCode className="size-4 text-blue-500" />;
    if (["json"].includes(ext)) return <FileJson className="size-4 text-emerald-500" />;
    if (["zip", "tar", "gz", "7z"].includes(ext))
      return <FileZip className="size-4 text-purple-500" />;
    if (["txt", "md", "yml", "yaml", "toml", "cfg", "conf", "properties"].includes(ext))
      return <FileText className="size-4 text-neutral-500" />;
    return <File className="size-4 text-neutral-400" />;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Files
          </h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm gap-1.5 px-3"
            >
              <Upload className="size-4" />
              Upload
            </button>
            <button
              onClick={() => setShowNewFolder(true)}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 text-sm gap-1.5 px-3"
            >
              <Plus className="size-4" />
              Folder
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-4 text-sm overflow-x-auto pb-1">
          <button
            onClick={() => setCurrentPath("/")}
            className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 whitespace-nowrap px-1"
          >
            /
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-neutral-300 dark:text-neutral-600">/</span>
              <button
                onClick={() => setCurrentPath("/" + pathParts.slice(0, i + 1).join("/"))}
                className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 whitespace-nowrap px-1"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {showNewFolder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-4 flex items-center gap-2"
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setShowNewFolder(false);
              }}
              className="flex h-9 flex-1 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm px-3"
            >
              Create
            </button>
          </motion.div>
        )}

        <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="size-4 bg-neutral-200 dark:bg-white/10 rounded" />
                  <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded w-1/3" />
                  <div className="ml-auto h-3 bg-neutral-200 dark:bg-white/10 rounded w-16" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center">
              <Folder className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                This folder is empty
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors group relative"
                  onClick={() => navigateTo(file)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ file, x: e.clientX, y: e.clientY });
                  }}
                >
                  {getFileIcon(file)}
                  <span className="text-sm text-neutral-900 dark:text-white truncate flex-1">
                    {renamingFile === file.name ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => {
                          if (renameValue.trim()) handleRename(file.name, renameValue);
                          setRenamingFile(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renameValue.trim()) handleRename(file.name, renameValue);
                          if (e.key === "Escape") setRenamingFile(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-b border-neutral-400 dark:border-neutral-500 focus:outline-none w-full"
                      />
                    ) : (
                      file.name
                    )}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                    {file.type === "directory" ? "—" : formatBytes(file.size || 0)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenu({ file, x: e.clientX, y: e.clientY });
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all"
                  >
                    <DotsThreeVertical className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl shadow-lg py-1 min-w-[160px]"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              {contextMenu.file.type === "file" && (
                <>
                  <button
                    onClick={() => {
                      const filePath = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                      window.location.href = `/server/${id}/files/edit/${filePath}`;
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
                  >
                    <PencilSimple className="size-4" />
                    Edit
                  </button>
                  {contextMenu.file.name.endsWith(".zip") ? (
                    <button
                      onClick={() => handleUnzip(contextMenu.file.name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
                    >
                      <FileZip className="size-4" />
                      Unzip
                    </button>
                  ) : (
                    <button
                      onClick={() => handleZip(contextMenu.file.name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
                    >
                      <FileZip className="size-4" />
                      Zip
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  setRenamingFile(contextMenu.file.name);
                  setRenameValue(contextMenu.file.name);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                <PencilSimple className="size-4" />
                Rename
              </button>
              <button
                onClick={() => {
                  const filePath = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                  const a = document.createElement("a");
                  a.href = `/server/${id}/files/download/${filePath}`;
                  a.click();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                <Download className="size-4" />
                Download
              </button>
              <div className="h-px bg-neutral-100 dark:bg-white/5 my-1" />
              <button
                onClick={() => {
                  const filePath = currentPath === "/" ? contextMenu.file.name : `${currentPath}/${contextMenu.file.name}`;
                  handleDelete(filePath);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash className="size-4" />
                Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
