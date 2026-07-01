import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FloppyDisk,
  Plus,
  Trash,
  Package,
  HardDrives,
  List,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import { useToast } from "@/context/ToastContext";

interface NodeOption { id: number; name: string; }
interface EggOption { id: number; name: string; dockerImage: string; }
interface PortAllocation { host: number; container: number; }

interface ServerData {
  uuid: string;
  name: string;
  nodeId: number;
  eggId: number;
  ownerId: number;
  ports: PortAllocation[];
  memory: number;
  cpu: number;
  disk: number;
  startCommand: string;
  dockerImage: string;
  variables: Record<string, string>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminServerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [eggs, setEggs] = useState<EggOption[]>([]);
  const [showPortModal, setShowPortModal] = useState(false);
  const [newPort, setNewPort] = useState<PortAllocation>({ host: 25565, container: 25565 });

  const [form, setForm] = useState({
    name: "",
    nodeId: null as number | null,
    eggId: null as number | null,
    ports: [] as PortAllocation[],
    memory: 1024,
    cpu: 100,
    disk: 10240,
    startCommand: "",
    dockerImage: "",
    variables: {} as Record<string, string>,
  });

  const fetchData = useCallback(async () => {
    try {
      const [serverRes, nodesRes, eggsRes] = await Promise.all([
        api.get<{ data: ServerData }>(`/admin/servers/${id}`),
        api.get<{ data: NodeOption[] }>("/admin/nodes/list"),
        api.get<{ data: EggOption[] }>("/admin/images/store/catalogue").catch(() => ({ data: [] })),
      ]);
      const s = serverRes.data;
      setForm({
        name: s.name,
        nodeId: s.nodeId,
        eggId: s.eggId,
        ports: s.ports || [],
        memory: s.memory,
        cpu: s.cpu,
        disk: s.disk,
        startCommand: s.startCommand,
        dockerImage: s.dockerImage,
        variables: s.variables || {},
      });
      setNodes(nodesRes.data || []);
      setEggs(eggsRes.data || []);
    } catch {
      toast("Failed to load server", "error");
      navigate("/admin/servers");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addPort = () => {
    update("ports", [...form.ports, newPort]);
    setNewPort({ host: newPort.host + 1, container: newPort.container + 1 });
    setShowPortModal(false);
  };

  const removePort = (index: number) => {
    update("ports", form.ports.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/admin/servers/update/${id}`, form);
      toast("DesktopTower updated successfully");
      navigate("/admin/servers");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update server", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/servers")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Edit DesktopTower</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{id}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4 text-neutral-400" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">DesktopTower Name</Label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Node</Label>
                <select
                  value={form.nodeId ?? ""}
                  onChange={(e) => update("nodeId", e.target.value ? parseInt(e.target.value) : null)}
                  className={cn(
                    "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                    "text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                  )}
                >
                  <option value="">Select node</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Egg</Label>
                <select
                  value={form.eggId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    update("eggId", val);
                  }}
                  className={cn(
                    "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                    "text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                  )}
                >
                  <option value="">Select egg</option>
                  {eggs.map((eg) => (
                    <option key={eg.id} value={eg.id}>{eg.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <List className="size-4 text-neutral-400" />
              Ports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.ports.map((port, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3"
              >
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    value={port.host}
                    onChange={(e) => {
                      const ports = [...form.ports];
                      ports[i] = { ...ports[i], host: parseInt(e.target.value) || 0 };
                      update("ports", ports);
                    }}
                  />
                  <Input
                    type="number"
                    value={port.container}
                    onChange={(e) => {
                      const ports = [...form.ports];
                      ports[i] = { ...ports[i], container: parseInt(e.target.value) || 0 };
                      update("ports", ports);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePort(i)}
                  className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Trash className="size-4" />
                </button>
              </motion.div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowPortModal(true)}>
              <Plus className="size-3" />
              Add Port
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrives className="size-4 text-neutral-400" />
              Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Memory (MB)</Label>
                <Input type="number" min={128} value={form.memory} onChange={(e) => update("memory", parseInt(e.target.value) || 128)} />
              </div>
              <div className="space-y-2">
                <Label>CPU (%)</Label>
                <Input type="number" min={1} value={form.cpu} onChange={(e) => update("cpu", parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-2">
                <Label>Disk (MB)</Label>
                <Input type="number" min={1024} value={form.disk} onChange={(e) => update("disk", parseInt(e.target.value) || 1024)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Docker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Docker Image</Label>
              <Input value={form.dockerImage} onChange={(e) => update("dockerImage", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Command</Label>
              <Input value={form.startCommand} onChange={(e) => update("startCommand", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate("/admin/servers")}>Cancel</Button>
          <Button type="submit" loading={submitting}>
            <FloppyDisk className="size-4" />
            Save Changes
          </Button>
        </div>
      </form>

      <AnimatePresence>
        {showPortModal && (
          <Modal open={showPortModal} onOpenChange={setShowPortModal}>
            <ModalContent>
              <ModalHeader>
                <ModalTitle>Add Port</ModalTitle>
              </ModalHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Host Port</Label>
                  <Input type="number" value={newPort.host} onChange={(e) => setNewPort({ ...newPort, host: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Container Port</Label>
                  <Input type="number" value={newPort.container} onChange={(e) => setNewPort({ ...newPort, container: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <ModalFooter>
                <ModalClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </ModalClose>
                <Button onClick={addPort}>Add Port</Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
