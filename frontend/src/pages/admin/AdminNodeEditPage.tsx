import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, FloppyDisk, Plus, Trash, HardDrives } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

interface NodeData {
  id: number;
  name: string;
  address: string;
  port: number;
  memory: number;
  disk: number;
  ports: Array<{ host: number; container: number; }>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminNodeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ram: 4096,
    cpu: 100,
    disk: 51200,
    address: "",
    port: 8080,
  });
  const [ports, setPorts] = useState<Array<{ host: number; container: number }>>([]);
  const [newPort, setNewPort] = useState({ host: 30000, container: 25565 });

  const fetchNode = useCallback(async () => {
    try {
      const res = await api.get<{ data: NodeData }>(`/admin/node/${id}`);
      const n = res.data;
      setForm({
        name: n.name,
        ram: n.memory,
        cpu: n.cpu ?? 100,
        disk: n.disk,
        address: n.address,
        port: n.port,
      });
      setPorts(n.ports || []);
    } catch {
      toast("Failed to load node", "error");
      navigate("/admin/nodes");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    fetchNode();
  }, [fetchNode]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addPort = () => {
    setPorts((prev) => [...prev, newPort]);
    setNewPort({ host: newPort.host + 1, container: newPort.container });
  };

  const removePort = (index: number) => {
    setPorts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put(`/admin/node/${id}/edit`, { ...form, ports });
      toast("Node updated successfully");
      navigate("/admin/nodes");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update node", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
        {[1, 2].map((i) => (
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
          onClick={() => navigate("/admin/nodes")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Edit Node</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">ID: {id}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrives className="size-4 text-neutral-400" />
              Node Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Node Name</Label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" value={form.port} onChange={(e) => update("port", parseInt(e.target.value) || 8080)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>RAM (MB)</Label>
                <Input type="number" min={512} value={form.ram} onChange={(e) => update("ram", parseInt(e.target.value) || 512)} />
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
            <CardTitle className="text-base">Port Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AnimatePresence>
              {ports.map((port, i) => (
                <motion.div
                  key={`${port.host}-${i}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      placeholder="Host"
                      value={port.host}
                      onChange={(e) => {
                        const updated = [...ports];
                        updated[i] = { ...updated[i], host: parseInt(e.target.value) || 0 };
                        setPorts(updated);
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Container"
                      value={port.container}
                      onChange={(e) => {
                        const updated = [...ports];
                        updated[i] = { ...updated[i], container: parseInt(e.target.value) || 0 };
                        setPorts(updated);
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
            </AnimatePresence>

            <div className="flex items-end gap-3 pt-2">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Host Port</Label>
                  <Input
                    type="number"
                    value={newPort.host}
                    onChange={(e) => setNewPort({ ...newPort, host: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Container Port</Label>
                  <Input
                    type="number"
                    value={newPort.container}
                    onChange={(e) => setNewPort({ ...newPort, container: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addPort}>
                <Plus className="size-3" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate("/admin/nodes")}>Cancel</Button>
          <Button type="submit" loading={submitting}>
            <FloppyDisk className="size-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
