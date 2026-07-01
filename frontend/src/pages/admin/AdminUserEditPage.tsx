import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FloppyDisk } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

interface UserData {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  serverLimit: number;
  maxMemory?: number;
  maxCpu?: number;
  maxStorage?: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminUserEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    isAdmin: false,
    serverLimit: 1,
    maxMemory: 1024,
    maxCpu: 100,
    maxStorage: 10240,
  });

  const fetchUser = useCallback(async () => {
    try {
      const res = await api.get<{ data: UserData }>(`/admin/users/${id}`);
      const u = res.data;
      setForm({
        email: u.email,
        password: "",
        isAdmin: u.isAdmin,
        serverLimit: u.serverLimit,
        maxMemory: u.maxMemory ?? 1024,
        maxCpu: u.maxCpu ?? 100,
        maxStorage: u.maxStorage ?? 10240,
      });
    } catch {
      toast("Failed to load user", "error");
      navigate("/admin/users");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete (payload as Record<string, unknown>).password;
      await api.post(`/admin/users/update/${id}`, payload);
      toast("User updated successfully");
      navigate("/admin/users");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update user", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
          onClick={() => navigate("/admin/users")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Edit User</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">ID: {id}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (leave blank to keep current)</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.isAdmin ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-white/10"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 size-4 rounded-full transition-transform ${
                    form.isAdmin ? "translate-x-5 bg-white dark:bg-neutral-900" : "bg-white dark:bg-neutral-400"
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Admin Access</p>
                <p className="text-xs text-neutral-500">Grant full administrative privileges</p>
              </div>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serverLimit">Server Limit</Label>
                <Input
                  id="serverLimit"
                  type="number"
                  min={0}
                  value={form.serverLimit}
                  onChange={(e) => update("serverLimit", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxMemory">Max Memory (MB)</Label>
                <Input
                  id="maxMemory"
                  type="number"
                  min={0}
                  value={form.maxMemory}
                  onChange={(e) => update("maxMemory", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxCpu">Max CPU (%)</Label>
                <Input
                  id="maxCpu"
                  type="number"
                  min={0}
                  max={1000}
                  value={form.maxCpu}
                  onChange={(e) => update("maxCpu", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxStorage">Max Storage (MB)</Label>
                <Input
                  id="maxStorage"
                  type="number"
                  min={0}
                  value={form.maxStorage}
                  onChange={(e) => update("maxStorage", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate("/admin/users")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <FloppyDisk className="size-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
