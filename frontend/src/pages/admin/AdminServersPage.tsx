import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass,
  Plus,
  Trash,
  PencilSimple,
  ArrowClockwise,
  Server,
  Radar,
  X,
  Warning,
  CheckSquare,
  Square,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";

interface ServerData {
  uuid: string;
  name: string;
  owner: string;
  nodeName: string;
  status: string;
  memory: number;
  cpu: number;
  disk: number;
  allocatedMemory?: number;
  allocatedCpu?: number;
  allocatedDisk?: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

const statusColors: Record<string, string> = {
  running: "bg-emerald-500",
  stopped: "bg-neutral-300 dark:bg-neutral-600",
  starting: "bg-amber-500",
  stopping: "bg-amber-500",
  error: "bg-red-500",
};

export function AdminServersPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ServerData | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
    setActionLoading(true);
    try {
      await api.post(`/admin/server/delete/${deleteTarget.uuid}`);
      setServers((prev) => prev.filter((s) => s.uuid !== deleteTarget.uuid));
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.uuid); return n; });
      setDeleteTarget(null);
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setActionLoading(true);
    try {
      await Promise.all([...selected].map((uuid) => api.post(`/admin/server/delete/${uuid}`)));
      setServers((prev) => prev.filter((s) => !selected.has(s.uuid)));
      setSelected(new Set());
      setBulkDeleteTarget(false);
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinstall = async (uuid: string) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/server/reinstall/${uuid}`);
      fetchServers();
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.uuid.toLowerCase().includes(search.toLowerCase()) ||
      s.owner.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Servers</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {servers.length} {servers.length === 1 ? "server" : "servers"} total
          </p>
        </div>
        <Button onClick={() => navigate("/admin/servers/create")}>
          <Plus className="size-4" />
          Create Server
        </Button>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-neutral-50 dark:bg-white/[0.02]">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="default">{selected.size} selected</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                    <X className="size-3" />
                    Clear
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm">
                    <Radar className="size-3" />
                    Radar Scan
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setBulkDeleteTarget(true)}>
                    <Trash className="size-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-neutral-50 dark:bg-white/[0.02]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Server className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                {search ? "No servers match your search" : "No servers found"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/30 dark:border-white/[0.07]">
                    <th className="w-10 px-4 py-3">
                      <button onClick={toggleAll} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                        {selected.size === filtered.length && filtered.length > 0 ? (
                          <CheckSquare className="size-4" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">UUID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Node</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden xl:table-cell">Resources</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
                  {filtered.map((srv) => (
                    <tr
                      key={srv.uuid}
                      className={cn(
                        "hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors",
                        selected.has(srv.uuid) && "bg-neutral-50 dark:bg-white/[0.03]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(srv.uuid)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                          {selected.has(srv.uuid) ? (
                            <CheckSquare className="size-4" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{srv.uuid.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="font-medium text-neutral-900 dark:text-white cursor-pointer hover:underline"
                          onClick={() => navigate(`/admin/servers/edit/${srv.uuid}`)}
                        >
                          {srv.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{srv.owner}</td>
                      <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">{srv.nodeName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("size-2 rounded-full", statusColors[srv.status] || statusColors.stopped)} />
                          <span className="text-neutral-600 dark:text-neutral-300 capitalize">{srv.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="text-xs text-neutral-500 space-y-0.5">
                          <p>{srv.allocatedMemory ?? srv.memory}MB / {srv.memory}MB RAM</p>
                          <p>{srv.allocatedCpu ?? srv.cpu}% / {srv.cpu}% CPU</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/servers/edit/${srv.uuid}`)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                          >
                            <PencilSimple className="size-4" />
                          </button>
                          <button
                            onClick={() => handleReinstall(srv.uuid)}
                            disabled={actionLoading}
                            className="p-2 rounded-lg text-neutral-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                          >
                            <ArrowClockwise className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(srv)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <Warning className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <ModalTitle className="text-center">Delete Server</ModalTitle>
            <ModalDescription className="text-center">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? All data will be permanently lost.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={actionLoading}>Cancel</Button>
            </ModalClose>
            <Button variant="danger" onClick={handleDelete} loading={actionLoading}>
              <Trash className="size-4" />
              Delete Server
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={bulkDeleteTarget} onOpenChange={(open) => !open && setBulkDeleteTarget(false)}>
        <ModalContent>
          <ModalHeader>
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <Warning className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <ModalTitle className="text-center">Delete {selected.size} Servers</ModalTitle>
            <ModalDescription className="text-center">
              This will permanently delete all selected servers and their data.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={actionLoading}>Cancel</Button>
            </ModalClose>
            <Button variant="danger" onClick={handleBulkDelete} loading={actionLoading}>
              <Trash className="size-4" />
              Delete All
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
