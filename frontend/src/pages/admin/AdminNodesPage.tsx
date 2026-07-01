import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MagnifyingGlass,
  Plus,
  Trash,
  PencilSimple,
  ChartLineUp,
  HardDrives,
  Copy,
  GearSix,
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
import { useToast } from "@/context/ToastContext";

interface NodeData {
  id: number;
  name: string;
  address: string;
  port: number;
  memory: number;
  disk: number;
  status?: string;
  serversCount?: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminNodesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NodeData | null>(null);
  const [showConfig, setShowConfig] = useState<NodeData | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setDeleting(true);
    try {
      await api.delete(`/admin/node/${deleteTarget.id}`);
      setNodes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Node deleted");
    } catch {
      toast("Failed to delete node", "error");
    } finally {
      setDeleting(false);
    }
  };

  const copyConfig = (node: NodeData) => {
    const config = `NODE_ID=${node.id}\nNODE_NAME=${node.name}\nFILAMENT_ADDRESS=${node.address}\nFILAMENT_PORT=${node.port}`;
    navigator.clipboard.writeText(config);
    toast("Config copied to clipboard");
  };

  const filtered = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.address.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Nodes</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {nodes.length} {nodes.length === 1 ? "node" : "nodes"} configured
          </p>
        </div>
        <Button onClick={() => navigate("/admin/nodes/create")}>
          <Plus className="size-4" />
          Create Node
        </Button>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input placeholder="Search nodes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <HardDrives className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">
              {search ? "No nodes match your search" : "No nodes found"}
            </p>
          </div>
        ) : (
          filtered.map((node) => (
            <motion.div
              key={node.id}
              variants={fadeUp}
              className="group"
            >
              <Card className="h-full hover:border-neutral-300 dark:hover:border-white/15 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "size-10 rounded-xl flex items-center justify-center",
                        node.status === "online"
                          ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-neutral-100 dark:bg-white/5 text-neutral-400"
                      )}>
                        <HardDrives className="size-5" weight="light" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white">{node.name}</h3>
                        <p className="text-xs text-neutral-400">{node.address}:{node.port}</p>
                      </div>
                    </div>
                    <Badge variant={node.status === "online" ? "success" : "neutral"}>
                      {node.status || "unknown"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02]">
                      <p className="text-xs text-neutral-400">Memory</p>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white tabular-nums">{node.memory} MB</p>
                    </div>
                    <div className="p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02]">
                      <p className="text-xs text-neutral-400">Disk</p>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white tabular-nums">{node.disk} MB</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 pt-3 border-t border-neutral-200/30 dark:border-white/[0.07]">
                    <button
                      onClick={() => navigate(`/admin/nodes/edit/${node.id}`)}
                      className="flex-1 p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors text-xs font-medium"
                    >
                      <PencilSimple className="size-4 inline mr-1.5" />
                      Configure
                    </button>
                    <button
                      onClick={() => navigate(`/admin/nodes/stats/${node.id}`)}
                      className="flex-1 p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors text-xs font-medium"
                    >
                      <ChartLineUp className="size-4 inline mr-1.5" />
                      Stats
                    </button>
                    <button
                      onClick={() => copyConfig(node)}
                      className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                      title="Copy config"
                    >
                      <Copy className="size-4" />
                    </button>
                    <button
                      onClick={() => setShowConfig(node)}
                      className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                      title="Configure command"
                    >
                      <GearSix className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(node)}
                      className="p-2 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash className="size-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle className="text-center">Delete Node</ModalTitle>
            <ModalDescription className="text-center">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? All associated servers will be affected.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={deleting}>Cancel</Button>
            </ModalClose>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash className="size-4" />
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={!!showConfig} onOpenChange={(open) => !open && setShowConfig(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Configure Command</ModalTitle>
            <ModalDescription>Run this command on your node server to connect it to the panel.</ModalDescription>
          </ModalHeader>
          <div className="py-4">
            <pre className="p-4 rounded-xl bg-neutral-950 text-emerald-400 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
              {showConfig && `NODE_ID=${showConfig.id}\nNODE_NAME=${showConfig.name}\nFILAMENT_ADDRESS=${showConfig.address}\nFILAMENT_PORT=${showConfig.port}`}
            </pre>
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary">Close</Button>
            </ModalClose>
            <Button onClick={() => showConfig && copyConfig(showConfig)}>
              <Copy className="size-4" />
              Copy
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
