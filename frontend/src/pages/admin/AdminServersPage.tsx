import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MagnifyingGlass,
  Trash,
  PencilSimple,
  ArrowSquareOut,
  Square,
  CheckSquare,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";

interface ServerData {
  id: number;
  uuid: string;
  name: string;
  owner: { id: number; username: string; avatar?: string };
  node: { id: number; name: string; address: string } | null;
  status: string;
  Suspended?: boolean;
}

export function AdminServersPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ServerData | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ServerData[] }>("/admin/servers/list");
      setServers(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const toggleSelect = (uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.uuid)));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.post(`/admin/server/delete/${deleteTarget.uuid}`);
      setServers((prev) => prev.filter((s) => s.uuid !== deleteTarget.uuid));
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.uuid); return n; });
      setDeleteTarget(null);
    } catch {
      // silent
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all([...selected].map((uuid) => api.post(`/admin/server/delete/${uuid}`)));
      setServers((prev) => prev.filter((s) => !selected.has(s.uuid)));
      setSelected(new Set());
    } catch {
      // silent
    }
  };

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.uuid.toLowerCase().includes(search.toLowerCase()) ||
      s.owner?.username?.toLowerCase().includes(search.toLowerCase()) ||
      s.node?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto pt-16">
      <div className="sm:flex sm:items-center px-8 pt-6 pb-4">
        <div className="sm:flex-auto">
          <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white">Servers</h1>
          <p className="mt-1 tracking-tight text-sm text-neutral-500">Manage your servers</p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <a
            href="/admin/servers/create"
            className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90"
          >
            New Server
          </a>
        </div>
      </div>

      <div className="mx-8 mb-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600/30 bg-white dark:bg-neutral-700 pl-10 pr-4 py-2 text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 placeholder-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-8 mb-6">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Total Servers</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{servers.length}</p>
          <p className="text-sm text-neutral-400 mt-2">{servers.filter((s) => s.status === "running").length} currently running</p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Users</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{[...new Set(servers.map((s) => s.owner?.id).filter(Boolean))].length}</p>
          <p className="text-sm text-neutral-400 mt-2">with servers assigned</p>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mx-8 mb-4">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/40">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300 mr-1">{selected.size} selected</span>
            <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1" />
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 border border-red-700/30 px-3 py-1.5 text-xs font-medium text-white transition-colors ml-auto"
            >
              <Trash size={14} className="shrink-0" />
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto shadow-sm rounded-xl mx-8 mt-2 mb-8 border border-neutral-200 dark:border-neutral-800/40">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 sm:pl-6 w-10">
                <button onClick={toggleAll} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                  {selected.size === filtered.length && filtered.length > 0 ? (
                    <CheckSquare size={16} />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              </th>
              <th scope="col" className="py-3.5 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white">Name</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-neutral-800 dark:text-white">Owner</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-neutral-800 dark:text-white">Node</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-neutral-800 dark:text-white">Status</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-neutral-800 dark:text-white"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-neutral-800">
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-5 bg-neutral-100 dark:bg-white/5 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No servers found</p>
                </td>
              </tr>
            ) : (
              filtered.map((srv) => (
                <tr
                  key={srv.uuid}
                  className="hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/servers/edit/${srv.id}`)}
                >
                  <td className="py-4 pl-4 pr-3 sm:pl-6 w-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(srv.uuid); }}
                      className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                    >
                      {selected.has(srv.uuid) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-4 pr-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 relative flex h-2 w-2">
                        {srv.Suspended ? (
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-400" />
                        ) : (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </>
                        )}
                      </span>
                      <div>
                        <div className="font-medium text-neutral-800 dark:text-white truncate max-w-[200px]">{srv.name}</div>
                        <div className="text-xs text-neutral-400 dark:text-neutral-500 font-mono mt-0.5">{srv.uuid}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <img
                        className="h-6 w-6 rounded-md object-cover shrink-0"
                        src={srv.owner?.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(srv.owner?.username || "")}`}
                        alt={srv.owner?.username}
                      />
                      <span className="font-medium text-neutral-800 dark:text-blue-400 truncate max-w-[120px]">{srv.owner?.username}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className="font-medium text-neutral-800 dark:text-blue-400 truncate max-w-[120px]">{srv.node?.name || "Unknown"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    {srv.Suspended ? (
                      <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">Suspended</span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Enabled</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/server/${srv.uuid}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Open console"
                        className="rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/30 p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        <ArrowSquareOut size={16} className="shrink-0" />
                      </a>
                      <a
                        href={`/admin/servers/edit/${srv.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Edit"
                        className="rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/30 p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        <PencilSimple size={16} className="shrink-0" />
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(srv); }}
                        className="rounded-xl bg-red-600 p-1.5 text-white hover:bg-red-500 transition"
                        title="Delete"
                      >
                        <Trash size={16} className="shrink-0" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 pt-6 pb-4">
              <p className="text-sm font-semibold text-neutral-800 dark:text-white mb-1">Delete Server</p>
              <p className="text-sm text-neutral-500">Delete "{deleteTarget.name}"? All server data will be permanently removed.</p>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
