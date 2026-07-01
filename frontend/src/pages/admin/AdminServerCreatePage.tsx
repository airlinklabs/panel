import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash,
  Package,
  User,
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

interface NodeOption {
  id: number;
  name: string;
  memory: number;
  disk: number;
}

interface EggOption {
  id: number;
  name: string;
  dockerImage: string;
}

interface UserOption {
  id: number;
  username: string;
}

interface PortAllocation {
  host: number;
  container: number;
}

interface FormData {
  name: string;
  nodeId: number | null;
  eggId: number | null;
  ownerId: number | null;
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

export function AdminServerCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [eggs, setEggs] = useState<EggOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showPortModal, setShowPortModal] = useState(false);
  const [newPort, setNewPort] = useState<PortAllocation>({ host: 25565, container: 25565 });

  const [form, setForm] = useState<FormData>({
    name: "",
    nodeId: null,
    eggId: null,
    ownerId: null,
    ports: [{ host: 25565, container: 25565 }],
    memory: 1024,
    cpu: 100,
    disk: 10240,
    startCommand: "",
    dockerImage: "",
    variables: {},
  });

  const fetchOptions = useCallback(async () => {
    try {
      const [nodesRes, eggsRes, usersRes] = await Promise.all([
        api.get<{ data: NodeOption[] }>("/admin/nodes/list"),
        api.get<{ data: EggOption[] }>("/admin/images/store/catalogue").catch(() => ({ data: [] })),
        api.get<{ data: UserOption[] }>("/admin/users/list").catch(() => ({ data: [] })),
      ]);
      setNodes(nodesRes.data || []);
      setEggs(eggsRes.data || []);
      setUsers(usersRes.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
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
    if (!form.name || !form.nodeId || !form.eggId || !form.ownerId) return;
    setSubmitting(true);
    try {
      await api.post("/admin/servers/create", form);
      toast("Server created successfully");
      navigate("/admin/servers");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create server", "error");
    } finally {
      setSubmitting(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Create Server</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Deploy a new game server</p>
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
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="My Server"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node">Node</Label>
                <select
                  id="node"
                  value={form.nodeId ?? ""}
                  onChange={(e) => update("nodeId", e.target.value ? parseInt(e.target.value) : null)}
                  className={cn(
                    "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                    "text-neutral-900 dark:text-white",
                    "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                  )}
                >
                  <option value="">Select node</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="egg">Image / Egg</Label>
                <select
                  id="egg"
                  value={form.eggId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    update("eggId", val);
                    const egg = eggs.find((eg) => eg.id === val);
                    if (egg) update("dockerImage", egg.dockerImage);
                  }}
                  className={cn(
                    "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                    "text-neutral-900 dark:text-white",
                    "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                  )}
                >
                  <option value="">Select egg</option>
                  {eggs.map((eg) => (
                    <option key={eg.id} value={eg.id}>{eg.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner">Owner</Label>
              <select
                id="owner"
                value={form.ownerId ?? ""}
                onChange={(e) => update("ownerId", e.target.value ? parseInt(e.target.value) : null)}
                className={cn(
                  "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                  "text-neutral-900 dark:text-white",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                )}
              >
                <option value="">Select owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
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
                    placeholder="Host port"
                    value={port.host}
                    onChange={(e) => {
                      const ports = [...form.ports];
                      ports[i] = { ...ports[i], host: parseInt(e.target.value) || 0 };
                      update("ports", ports);
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Container port"
                    value={port.container}
                    onChange={(e) => {
                      const ports = [...form.ports];
                      ports[i] = { ...ports[i], container: parseInt(e.target.value) || 0 };
                      update("ports", ports);
                    }}
                  />
                </div>
                {form.ports.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePort(i)}
                    className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash className="size-4" />
                  </button>
                )}
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
                <Label htmlFor="memory">Memory (MB)</Label>
                <Input
                  id="memory"
                  type="number"
                  min={128}
                  value={form.memory}
                  onChange={(e) => update("memory", parseInt(e.target.value) || 128)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpu">CPU (%)</Label>
                <Input
                  id="cpu"
                  type="number"
                  min={1}
                  value={form.cpu}
                  onChange={(e) => update("cpu", parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disk">Disk (MB)</Label>
                <Input
                  id="disk"
                  type="number"
                  min={1024}
                  value={form.disk}
                  onChange={(e) => update("disk", parseInt(e.target.value) || 1024)}
                />
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
              <Label htmlFor="dockerImage">Docker Image</Label>
              <Input
                id="dockerImage"
                value={form.dockerImage}
                onChange={(e) => update("dockerImage", e.target.value)}
                placeholder="ghcr.io/parkervcp/yolks:minecraft"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startCommand">Start Command</Label>
              <Input
                id="startCommand"
                value={form.startCommand}
                onChange={(e) => update("startCommand", e.target.value)}
                placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate("/admin/servers")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!form.name || !form.nodeId || !form.eggId || !form.ownerId}>
            <Plus className="size-4" />
            Create Server
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
                  <Input
                    type="number"
                    value={newPort.host}
                    onChange={(e) => setNewPort({ ...newPort, host: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Container Port</Label>
                  <Input
                    type="number"
                    value={newPort.container}
                    onChange={(e) => setNewPort({ ...newPort, container: parseInt(e.target.value) || 0 })}
                  />
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
