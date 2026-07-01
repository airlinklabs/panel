import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, DesktopTower, ArrowLeft } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const gameTypes = [
  { value: "minecraft", label: "Minecraft" },
  { value: "terraria", label: "Terraria" },
  { value: "valheim", label: "Valheim" },
  { value: "rust", label: "Rust" },
  { value: "palworld", label: "Palworld" },
  { value: "cs2", label: "Counter-Strike 2" },
  { value: "garrysmod", label: "Garry's Mod" },
  { value: "ark", label: "ARK: Survival Evolved" },
];

const plans = [
  { value: "starter", label: "Starter", cpu: "2 vCPU", ram: "2 GB", disk: "20 GB", price: "$5/mo" },
  { value: "standard", label: "Standard", cpu: "4 vCPU", ram: "4 GB", disk: "40 GB", price: "$10/mo" },
  { value: "premium", label: "Premium", cpu: "8 vCPU", ram: "8 GB", disk: "80 GB", price: "$20/mo" },
];

export function ConsumerCreateServerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gameType: "",
    plan: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.gameType || !form.plan) {
      toast("Please fill in all fields", "error");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/consumer/v1/servers", form);
      toast("DesktopTower created successfully", "success");
      navigate("/consumer/overview");
    } catch {
      toast("Failed to create server", "error");
    } finally {
      setCreating(false);
    }
  };

  const selectedPlan = plans.find((p) => p.value === form.plan);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate("/consumer/overview")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
            Create DesktopTower
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Deploy a new game server
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">DesktopTower Details</CardTitle>
          <CardDescription>
            Choose a name, game type, and plan for your server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="server-name">DesktopTower Name</Label>
            <Input
              id="server-name"
              placeholder="my-minecraft-server"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Game Type</Label>
            <Select value={form.gameType} onValueChange={(v) => updateField("gameType", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a game" />
              </SelectTrigger>
              <SelectContent>
                {gameTypes.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plan</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.map((plan) => (
                <button
                  key={plan.value}
                  onClick={() => updateField("plan", plan.value)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    form.plan === plan.value
                      ? "border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5"
                      : "border-neutral-200/30 dark:border-white/[0.07] hover:border-neutral-300 dark:hover:border-white/15"
                  )}
                >
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {plan.label}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {plan.cpu} · {plan.ram} · {plan.disk}
                  </p>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white mt-2">
                    {plan.price}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedPlan && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] p-4"
            >
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                Summary
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Name
                  </span>
                  <span className="text-neutral-900 dark:text-white">
                    {form.name || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Game
                  </span>
                  <span className="text-neutral-900 dark:text-white">
                    {gameTypes.find((g) => g.value === form.gameType)
                      ?.label || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Plan
                  </span>
                  <span className="text-neutral-900 dark:text-white">
                    {selectedPlan.label} ({selectedPlan.price})
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSubmit}
              loading={creating}
              disabled={!form.name.trim() || !form.gameType || !form.plan}
            >
              <Plus className="size-4" />
              Create DesktopTower
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
