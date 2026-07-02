import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MagnifyingGlass,
  Trash,
  PencilSimple,
  Copy,
  GearSix,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

interface NodeData {
  id: number;
  name: string;
  address: string;
  port: number;
  memory: number;
  disk: number;
  status?: string;
  versionRelease?: string;
  error?: string;
  instances?: { id: number }[];
}

export function AdminNodesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NodeData | null>(null);
  const [showConfig, setShowConfig] = useState<NodeData | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: NodeData[] }>("/admin/nodes/list");
      setNodes(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/node/${deleteTarget.id}`);
      setNodes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Node deleted");
    } catch {
      toast("Failed to delete node", "error");
    }
  };

  const copyConfig = (node: NodeData) => {
    const config = `NODE_ID=${node.id}\nNODE_NAME=${node.name}\nFILAMENT_ADDRESS=${node.address}\nFILAMENT_PORT=${node.port}`;
    navigator.clipboard.writeText(config);
    toast("Config copied to clipboard");
  };

  const getStatusDot = (status?: string) => {
    if (status === "Online") {
      return (
        <span className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      );
    } else if (status === "Offline") {
      return <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />;
    } else {
      return (
        <span className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      );
    }
  };

  const filtered = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.address.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = nodes.filter((n) => n.status === "Online").length;
  const pct = nodes.length > 0 ? Math.round((onlineCount / nodes.length) * 100) : 0;
  const totalServers = nodes.reduce((t, n) => t + (n.instances ? n.instances.length : 0), 0);

  return (
    <div className="flex-1 overflow-y-auto pt-16">
      <div className="sm:flex sm:items-center px-8 pt-6 pb-4">
        <div className="sm:flex-auto">
          <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white">Nodes</h1>
          <p className="mt-1 tracking-tight text-sm text-neutral-500">Manage your nodes</p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/admin/nodes/create")}
              className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90"
            >
              New Node
            </button>
          </div>
        </div>
      </div>

      <div className="mx-8 mb-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600/30 bg-white dark:bg-neutral-700 pl-10 pr-4 py-2 text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 placeholder-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-8 mb-6">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Total Nodes</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{nodes.length}</p>
          {nodes.length > 0 ? (
            <>
              <p className="text-sm text-neutral-400 mt-2">Online nodes: {onlineCount}</p>
              <div className="mt-2 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-400 mt-2">No nodes yet</p>
          )}
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Server Count</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{totalServers}</p>
          <p className="text-sm text-neutral-400 mt-2">across all nodes</p>
        </div>
      </div>

      {nodes.some((n) => n.status === "Offline") && (
        <div className="mx-8 mb-4">
          <div className="shadow-lg rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            One or more nodes are offline. Some information may be unavailable.
          </div>
        </div>
      )}

      <div className="overflow-x-auto shadow-sm rounded-xl mx-8 mt-2 mb-8 border border-neutral-200 dark:border-neutral-800/40">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Name</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Connection</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Instances</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-neutral-800">
            {loading ? (
              [1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-4">
                    <div className="h-5 bg-neutral-100 dark:bg-white/5 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No nodes found</p>
                </td>
              </tr>
            ) : (
              filtered.map((node) => (
                <tr
                  key={node.id}
                  className="hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/node/${node.id}/stats`)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <div className="flex items-center">
                      <div className="mr-5">{getStatusDot(node.status)}</div>
                      <div className="font-medium text-neutral-800 dark:text-white">{node.name}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {node.address}:{node.port}
                    {" "}
                    {node.versionRelease ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{node.versionRelease}</span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400">unknown</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">{node.instances?.length || 0}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowConfig(node); }}
                        className="rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                      >
                        Configure
                      </button>
                      <a href={`/admin/node/${node.id}`} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                        >
                          Edit
                        </button>
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(node); }}
                        className="rounded-xl bg-red-600 hover:bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white transition"
                        aria-label="Delete node"
                      >
                        <Trash size={14} className="text-white" />
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
              <p className="text-sm font-semibold text-neutral-800 dark:text-white mb-1">Delete Node</p>
              <p className="text-sm text-neutral-500">Are you sure you want to delete "{deleteTarget.name}"? This will permanently remove the node.</p>
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

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/60 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 pt-5 pb-4">
              <p className="text-sm font-semibold text-neutral-800 dark:text-white leading-snug mb-1">Node Configuration</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">Run this command to auto-configure your node:</p>
              <pre className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3 text-xs font-mono text-emerald-600 dark:text-emerald-400 overflow-x-auto mt-3 mb-4">
                NODE_ID={showConfig.id}
                {"\n"}NODE_NAME={showConfig.name}
                {"\n"}FILAMENT_ADDRESS={showConfig.address}
                {"\n"}FILAMENT_PORT={showConfig.port}
              </pre>
            </div>
            <div className="flex gap-2 px-5 pb-6 justify-end">
              <button
                onClick={() => copyConfig(showConfig)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition"
              >
                Copy
              </button>
              <button
                onClick={() => setShowConfig(null)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
