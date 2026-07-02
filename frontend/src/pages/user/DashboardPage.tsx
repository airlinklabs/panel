import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  GridFour,
  List,
  MagnifyingGlass,
  Folder,
  FolderPlus,
  Funnel,
  ArrowsDownUp,
  X,
  ComputerTower,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
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
  owner: { id: number; username: string; avatar: string | null };
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
  members: { id: number; serverId: number; serverUUID: string }[];
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md shrink-0 border",
        status === "running"
          ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
          : status === "starting"
            ? "bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
            : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "running" && (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </>
        )}
        {status === "starting" && (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </>
        )}
        {status !== "running" && status !== "starting" && (
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        )}
      </span>
      {status === "running" ? "Running" : status === "starting" ? "Starting" : "Stopped"}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/3" />
          <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/2" />
        </div>
        <div className="h-5 w-16 bg-neutral-200 dark:bg-white/10 rounded-full" />
      </div>
      <div className="flex gap-3 mb-3">
        <div className="flex-1 h-12 bg-neutral-200 dark:bg-white/10 rounded-xl" />
        <div className="flex-1 h-12 bg-neutral-200 dark:bg-white/10 rounded-xl" />
        <div className="flex-1 h-12 bg-neutral-200 dark:bg-white/10 rounded-xl" />
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: ServerData }) {
  const avatarUrl = server.owner?.avatar
    || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(server.owner?.username || "unknown")}`;

  return (
    <Link to={`/server/${server.UUID}`}>
      <div className="group relative block bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm p-4 cursor-grab hover:border-neutral-300 dark:hover:border-white/10 hover:shadow-md dark:hover:shadow-none transition-[box-shadow,transform,border-color] duration-150 active:cursor-grabbing">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1 mr-3">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white truncate">
              {server.name}
            </h3>
            {server.description ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {server.description}
              </p>
            ) : (
              <p className="text-xs text-neutral-400 mt-0.5 truncate italic">
                No description
              </p>
            )}
          </div>
          <StatusBadge status={server.status} />
        </div>

        <div className="flex gap-3 mb-3">
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-700 rounded-xl px-3 py-2">
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">RAM</p>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {Math.round(parseFloat(server.ramUsage || "0"))}%
            </p>
          </div>
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-700 rounded-xl px-3 py-2">
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">CPU</p>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {Math.round(parseFloat(server.cpuUsage || "0"))}%
            </p>
          </div>
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-700 rounded-xl px-3 py-2">
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Used</p>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {server.ramUsed || "0MB"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              className="h-4 w-4 rounded-md shrink-0"
              src={avatarUrl}
              alt={`${server.owner?.username || "Unknown"} avatar`}
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {server.owner?.username || "Unknown"}
            </span>
          </div>
          {server.node && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 ml-2 truncate max-w-[6rem]">
              {server.node.name || server.node.address}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function FolderCard({ folder }: { folder: FolderData }) {
  return (
    <div className="flex items-center gap-3 bg-white dark:bg-white/[0.03] border border-neutral-200 dark:border-white/[0.07] rounded-xl px-3.5 py-3 cursor-pointer relative transition-[background,border-color,box-shadow] select-none hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-neutral-300 dark:hover:border-white/[0.12] hover:shadow-sm group">
      <Folder className="h-5 w-5 text-amber-500 shrink-0" weight="fill" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">
          {folder.name}
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
          {folder.members.length} server{folder.members.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
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
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("");

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
    let result = servers.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "running" && s.status === "running") ||
        (statusFilter === "stopped" && s.status === "stopped");
      return matchesSearch && matchesStatus;
    });

    if (sort) {
      result = [...result].sort((a, b) => {
        switch (sort) {
          case "name-asc":
            return a.name.localeCompare(b.name);
          case "name-desc":
            return b.name.localeCompare(a.name);
          case "status-asc":
            const statusOrder: Record<string, number> = { running: 0, starting: 1, stopped: 2 };
            return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          case "ramUsage-desc":
            return parseFloat(b.ramUsage || "0") - parseFloat(a.ramUsage || "0");
          case "cpuUsage-desc":
            return parseFloat(b.cpuUsage || "0") - parseFloat(a.cpuUsage || "0");
          default:
            return 0;
        }
      });
    }

    return result;
  }, [servers, search, statusFilter, sort]);

  const foldersInUse = useMemo(() => {
    const serverIds = new Set(folders.flatMap((f) => f.members.map((m) => m.serverUUID)));
    return serverIds;
  }, [folders]);

  return (
    <div className="px-12 pt-6 pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">
            Servers
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Manage and monitor your servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/create-server"
            className="flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 transition"
          >
            <Plus className="h-4 w-4" />
            New server
          </Link>
          <button className="flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 transition">
            <FolderPlus className="h-4 w-4" weight="light" />
            New folder
          </button>
          {servers.length > 0 && (
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-xl border border-neutral-200 dark:border-white/5">
              <button
                onClick={() => setView("grid")}
                className={cn(
                  "min-h-9 px-3 py-1.5 text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors",
                  view === "grid"
                    ? "bg-white dark:bg-white/[0.08] text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                )}
              >
                <GridFour className="h-4 w-4" />
                Grid
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "min-h-9 px-3 py-1.5 text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors",
                  view === "list"
                    ? "bg-white dark:bg-white/[0.08] text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                )}
              >
                <List className="h-4 w-4" />
                List
              </button>
            </div>
          )}
        </div>
      </div>

      <div id="filterBar" className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800">
          <Funnel className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm text-neutral-800 dark:text-white focus:outline-none appearance-none pr-2"
          >
            <option value="">Status</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800">
          <ArrowsDownUp className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-transparent text-sm text-neutral-800 dark:text-white focus:outline-none appearance-none pr-2"
          >
            <option value="">Sort</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="status-asc">Status (Running first)</option>
            <option value="ramUsage-desc">RAM (Highest)</option>
            <option value="cpuUsage-desc">CPU (Highest)</option>
          </select>
        </div>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers..."
            className="w-full pl-3 pr-8 py-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : servers.length === 0 && folders.length === 0 ? (
        <section className="mx-auto mt-28 max-w-2xl overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-7 text-left shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/10 text-neutral-400 dark:text-neutral-500">
              <ComputerTower className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
                No servers assigned
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">
                Your server list is empty
              </h2>
            </div>
          </div>
          <p className="max-w-xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
            Create your first server and it will appear here with live RAM, CPU, and node details.
          </p>
          <Link
            to="/create-server"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 dark:bg-white dark:text-neutral-900"
          >
            Create server
          </Link>
        </section>
      ) : (
        <>
          {folders.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3">
                Folders
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {folders.map((folder) => (
                  <FolderCard key={folder.id} folder={folder} />
                ))}
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
                Drag a server card onto a folder to add it
              </p>
            </div>
          )}

          <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3">
            Servers
          </p>

          {view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {filteredServers
                .filter((s) => !foldersInUse.has(s.UUID))
                .map((server) => (
                  <ServerCard key={server.UUID} server={server} />
                ))}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-white/5 overflow-hidden shadow-sm mb-6">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/5">
                <thead className="bg-neutral-50 dark:bg-neutral-800">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Server
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Owner
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      RAM
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      CPU
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-transparent">
                  {filteredServers
                    .filter((s) => !foldersInUse.has(s.UUID))
                    .map((server) => (
                      <tr
                        key={server.UUID}
                        className="hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => {
                          window.location.href = `/server/${server.UUID}`;
                        }}
                      >
                        <td className="py-3.5 pl-6 pr-3">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {server.name}
                          </p>
                          {server.description && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                              {server.description}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusBadge status={server.status} />
                        </td>
                        <td className="px-3 py-3.5 text-sm text-neutral-600 dark:text-neutral-300">
                          {server.owner?.username || "Unknown"}
                        </td>
                        <td className="px-3 py-3.5 text-sm text-neutral-600 dark:text-neutral-300">
                          {Math.round(parseFloat(server.ramUsage || "0"))}%
                        </td>
                        <td className="px-3 py-3.5 text-sm text-neutral-600 dark:text-neutral-300">
                          {Math.round(parseFloat(server.cpuUsage || "0"))}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredServers.filter((s) => !foldersInUse.has(s.UUID)).length === 0 && (search || statusFilter) && (
            <div className="flex flex-col items-center justify-center mt-16 text-center">
              <MagnifyingGlass className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-3" />
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                No servers match your filters
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
