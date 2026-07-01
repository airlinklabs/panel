import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, HardDrives } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminNodeCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ram: 4096,
    cpu: 100,
    disk: 51200,
    address: "",
    port: 8080,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address) return;
    setSubmitting(true);
    try {
      await api.post("/admin/nodes/create", form);
      toast("Node created successfully");
      navigate("/admin/nodes");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create node", "error");
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
          onClick={() => navigate("/admin/nodes")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Create Node</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Add a new node to the cluster</p>
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
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Node 1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={form.port}
                  onChange={(e) => update("port", parseInt(e.target.value) || 8080)}
                />
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
                <Label htmlFor="ram">RAM (MB)</Label>
                <Input
                  id="ram"
                  type="number"
                  min={512}
                  value={form.ram}
                  onChange={(e) => update("ram", parseInt(e.target.value) || 512)}
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

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate("/admin/nodes")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!form.name || !form.address}>
            <Plus className="size-4" />
            Create Node
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
