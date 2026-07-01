import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  GridFour,
  List,
  MagnifyingGlass,
  Folder,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowRight,
  FolderSimple,
  Funnel,
  X,
} from "@phosphor-icons/react";
import { cn, formatBytes } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface ServerData {
  id: number;
  UUID: string;
  name: string;
  description: string | null;
  Memory: number;
  Cpu: number;
  Storage: number;
  nodeId: number;
  ownerId: number;
  node: { id: number; name: string; address: string };
  owner: { id: number; username: string };
  status: string;
  ramUsage: string;
  cpuUsage: string;
  ramUsed: string;
  nodeOffline: boolean;
}

interface FolderData {
  id: number;
  name: string;
  ownerId: number;
  members: { id: number; serverId: number }[];
}

const statusColors: Record<string, string> = {
  running: "bg-emerald-500",
  stopped: "bg-red-500",
  starting: "bg-amber-500",
  unknown: "bg-neutral-400 dark:bg-neutral-600",
};

const statusLabels: Record<string, string> = {
  running: "Online",
  stopped: "Offline",
  starting: "Starting",
  unknown: "Unknown",
};

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/3" />
          <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/2" />
        </div>
        <div className="h-5 w-16 bg-neutral-200 dark:bg-white/10 rounded-full" />
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded-lg w-full" />
        <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded-lg w-2/3" />
        <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/2" />
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: ServerData }) {
  return (
    <Link to={`/server/${server.UUID}`}>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-5 hover:border-neutral-300 dark:hover:border-white/[0.12] transition-colors cursor-pointer h-full"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm text-neutral-900 dark:text-white truncate">
              {server.name}
            </h3>
            {server.description && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                {server.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            <span className={cn("size-2 rounded-full", statusColors[server.status] || statusColors.unknown)}>
              {(server.status === "running" || server.status === "starting") && (
                <span className={cn("size-2 rounded-full animate-ping absolute", statusColors[server.status])} />
              )}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {statusLabels[server.status] || "Unknown"}
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <MemoryStick className="size-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
            <div className="flex-1 h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-400 dark:bg-neutral-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, parseFloat(server.ramUsage || "0"))}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
              {server.ramUsed || "0MB"} / {server.Memory}MB
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Cpu className="size-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
            <div className="flex-1 h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-400 dark:bg-neutral-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, parseFloat(server.cpuUsage || "0"))}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
              {parseFloat(server.cpuUsage || "0").toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <HardDrive className="size-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
            <div className="flex-1 h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-400 dark:bg-neutral-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (0 / server.Storage) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
              {formatBytes(server.Storage * 1024 * 1024)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {server.node?.name || "Unknown node"}
          </span>
          <ArrowRight className="size-3.5 text-neutral-300 dark:text-neutral-600" />
        </div>
      </motion.div>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [servers, setServers] = useState<ServerData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("dashboard-view") as "grid" | "list") || "grid";
  });
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem("dashboard-view", view);
  }, [view]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      const data = await res.json();
      setServers(data.data?.servers || []);
      setFolders(data.data?.folders || []);
    } catch {
      toast("Failed to load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [servers, search]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
              Servers
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              {servers.length} server{servers.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/create-server"
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm gap-1.5 px-3"
            >
              <Plus className="size-4" />
              Create server
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers..."
              className="flex h-9 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-9 pr-4 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-100 dark:bg-white/5 rounded-xl p-0.5">
              <button
                onClick={() => setView("grid")}
                className={cn(
                  "h-8 inline-flex items-center justify-center rounded-lg transition-all text-sm px-2.5",
                  view === "grid"
                    ? "bg-white dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                <GridFour className="size-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "h-8 inline-flex items-center justify-center rounded-lg transition-all text-sm px-2.5",
                  view === "list"
                    ? "bg-white dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {folders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
              Folders
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedFolder(null)}
                className={cn(
                  "h-8 inline-flex items-center justify-center rounded-xl transition-all text-sm px-3 gap-1.5 border",
                  selectedFolder === null
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent"
                    : "bg-white dark:bg-white/[0.03] text-neutral-600 dark:text-neutral-400 border-neutral-200/30 dark:border-white/[0.07] hover:bg-neutral-50 dark:hover:bg-white/5"
                )}
              >
                <FolderSimple className="size-3.5" />
                All
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  className={cn(
                    "h-8 inline-flex items-center justify-center rounded-xl transition-all text-sm px-3 gap-1.5 border",
                    selectedFolder === folder.id
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent"
                      : "bg-white dark:bg-white/[0.03] text-neutral-600 dark:text-neutral-400 border-neutral-200/30 dark:border-white/[0.07] hover:bg-neutral-50 dark:hover:bg-white/5"
                  )}
                >
                  <Folder className="size-3.5" />
                  {folder.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className={cn(view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredServers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Server className="size-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-1">
              {search ? "No servers found" : "No servers yet"}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              {search
                ? "Try adjusting your search"
                : "Create your first server to get started"}
            </p>
            {!search && (
              <Link
                to="/create-server"
                className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm gap-1.5 px-3"
              >
                <Plus className="size-4" />
                Create server
              </Link>
            )}
          </motion.div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredServers.map((server, i) => (
                <motion.div
                  key={server.UUID}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                >
                  <ServerCard server={server} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Server
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden sm:table-cell">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden md:table-cell">
                      CPU
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden md:table-cell">
                      Memory
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden lg:table-cell">
                      Node
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
                  {filteredServers.map((server) => (
                    <tr
                      key={server.UUID}
                      className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link to={`/server/${server.UUID}`} className="block">
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {server.name}
                          </div>
                          {server.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                              {server.description}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("size-2 rounded-full", statusColors[server.status] || statusColors.unknown)} />
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {statusLabels[server.status] || "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums hidden md:table-cell">
                        {parseFloat(server.cpuUsage || "0").toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums hidden md:table-cell">
                        {server.ramUsed || "0MB"}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 hidden lg:table-cell">
                        {server.node?.name || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/server/${server.UUID}`}
                          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
