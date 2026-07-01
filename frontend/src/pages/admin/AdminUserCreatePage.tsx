import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  X,
  UserPlus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

interface FormData {
  username: string;
  email: string;
  password: string;
  isAdmin: boolean;
  serverLimit: number;
  maxMemory: number;
  maxCpu: number;
  maxStorage: number;
}

interface Validation {
  username: { minLength: boolean; maxLength: boolean; noSpaces: boolean };
  password: { minLength: boolean; hasNumber: boolean; hasSpecial: boolean };
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

function Criterion({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {met ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <X className="size-3 text-neutral-400" />
      )}
      <span className={cn(met ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400")}>
        {label}
      </span>
    </div>
  );
}

export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    isAdmin: false,
    serverLimit: 1,
    maxMemory: 1024,
    maxCpu: 100,
    maxStorage: 10240,
  });

  const validation: Validation = {
    username: {
      minLength: form.username.length >= 3,
      maxLength: form.username.length <= 32,
      noSpaces: !/\s/.test(form.username),
    },
    password: {
      minLength: form.password.length >= 8,
      hasNumber: /\d/.test(form.password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(form.password),
    },
  };

  const isValid =
    form.username.length >= 3 &&
    form.email.includes("@") &&
    form.password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    try {
      await api.post("/admin/users/create-user", form);
      toast("User created successfully");
      navigate("/admin/users");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Create User</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Add a new user to the system</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="johndoe"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <Criterion met={validation.username.minLength} label="Min 3 characters" />
                <Criterion met={validation.username.maxLength} label="Max 32 characters" />
                <Criterion met={validation.username.noSpaces} label="No spaces" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="••••••••"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <Criterion met={validation.password.minLength} label="Min 8 characters" />
                <Criterion met={validation.password.hasNumber} label="Contains number" />
                <Criterion met={validation.password.hasSpecial} label="Contains special character" />
              </div>
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
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  form.isAdmin ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-white/10"
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 left-1 size-4 rounded-full transition-transform",
                    form.isAdmin ? "translate-x-5 bg-white dark:bg-neutral-900" : "bg-white dark:bg-neutral-400"
                  )}
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
          <Button type="submit" loading={submitting} disabled={!isValid}>
            <UserPlus className="size-4" />
            Create User
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
