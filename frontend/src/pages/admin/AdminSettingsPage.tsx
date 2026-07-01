import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Palette,
  DesktopTower,
  ShieldCheck,
  FloppyDisk,
  Upload,
  X,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

interface AppearanceSettings {
  title: string;
  description: string;
  logo: string;
  theme: string;
}

interface ServerPolicySettings {
  allowRegistration: boolean;
  serverLimit: number;
  defaultMemory: number;
  defaultDisk: number;
}

interface SecuritySettings {
  rateLimitEnabled: boolean;
  rateLimitWindow: number;
  rateLimitMax: number;
  ipBans: string[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

const tabs = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "server-policy", label: "DesktopTower Policy", icon: DesktopTower },
  { id: "security", label: "Security", icon: ShieldCheck },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AdminSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBan, setNewBan] = useState("");

  const [appearance, setAppearance] = useState<AppearanceSettings>({
    title: "Airlink Panel",
    description: "",
    logo: "",
    theme: "dark",
  });

  const [policy, setPolicy] = useState<ServerPolicySettings>({
    allowRegistration: true,
    serverLimit: 5,
    defaultMemory: 1024,
    defaultDisk: 10240,
  });

  const [security, setSecurity] = useState<SecuritySettings>({
    rateLimitEnabled: true,
    rateLimitWindow: 60,
    rateLimitMax: 60,
    ipBans: [],
  });

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get<{ data: { appearance: AppearanceSettings; serverPolicy: ServerPolicySettings; security: SecuritySettings } }>("/api/admin/settings");
      if (res.data?.appearance) setAppearance(res.data.appearance);
      if (res.data?.serverPolicy) setPolicy(res.data.serverPolicy);
      if (res.data?.security) setSecurity(res.data.security);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveAppearance = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", appearance.title);
      fd.append("description", appearance.description);
      fd.append("theme", appearance.theme);
      await api.upload("/admin/settings", fd);
      toast("Appearance saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      await api.post("/admin/settings/server-policy", policy);
      toast("DesktopTower policy saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSecurity = async () => {
    setSaving(true);
    try {
      await api.post("/admin/settings/security", security);
      toast("Security settings saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const addBan = () => {
    if (newBan && !security.ipBans.includes(newBan)) {
      setSecurity((prev) => ({ ...prev, ipBans: [...prev.ipBans, newBan] }));
      setNewBan("");
    }
  };

  const removeBan = (ip: string) => {
    setSecurity((prev) => ({ ...prev, ipBans: prev.ipBans.filter((b) => b !== ip) }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
        <div className="h-96 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Configure your panel</p>
      </div>

      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "appearance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Customize the look and feel of your panel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Panel Title</Label>
              <Input
                value={appearance.title}
                onChange={(e) => setAppearance((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={appearance.description}
                onChange={(e) => setAppearance((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {appearance.logo && (
                  <div className="size-12 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center overflow-hidden">
                    <img src={appearance.logo} alt="Logo" className="size-full object-contain" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    value={appearance.logo}
                    onChange={(e) => setAppearance((p) => ({ ...p, logo: e.target.value }))}
                    placeholder="Logo URL"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Default Theme</Label>
              <div className="flex gap-2">
                {["dark", "light"].map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setAppearance((p) => ({ ...p, theme }))}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize",
                      appearance.theme === theme
                        ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                        : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400"
                    )}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={saveAppearance} loading={saving}>
                <FloppyDisk className="size-4" />
                Save Appearance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "server-policy" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DesktopTower Policy</CardTitle>
            <CardDescription>Control server creation and resource limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  policy.allowRegistration ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-white/10"
                )}
                onClick={() => setPolicy((p) => ({ ...p, allowRegistration: !p.allowRegistration }))}
              >
                <div
                  className={cn(
                    "absolute top-1 left-1 size-4 rounded-full transition-transform",
                    policy.allowRegistration ? "translate-x-5 bg-white dark:bg-neutral-900" : "bg-white dark:bg-neutral-400"
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Allow Registration</p>
                <p className="text-xs text-neutral-500">Allow new users to register accounts</p>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>DesktopTower Limit per User</Label>
                <Input
                  type="number"
                  min={0}
                  value={policy.serverLimit}
                  onChange={(e) => setPolicy((p) => ({ ...p, serverLimit: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Memory (MB)</Label>
                <Input
                  type="number"
                  min={128}
                  value={policy.defaultMemory}
                  onChange={(e) => setPolicy((p) => ({ ...p, defaultMemory: parseInt(e.target.value) || 128 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Disk (MB)</Label>
                <Input
                  type="number"
                  min={1024}
                  value={policy.defaultDisk}
                  onChange={(e) => setPolicy((p) => ({ ...p, defaultDisk: parseInt(e.target.value) || 1024 }))}
                />
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={savePolicy} loading={saving}>
                <FloppyDisk className="size-4" />
                Save Policy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "security" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
            <CardDescription>Rate limiting and IP management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  security.rateLimitEnabled ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-white/10"
                )}
                onClick={() => setSecurity((p) => ({ ...p, rateLimitEnabled: !p.rateLimitEnabled }))}
              >
                <div
                  className={cn(
                    "absolute top-1 left-1 size-4 rounded-full transition-transform",
                    security.rateLimitEnabled ? "translate-x-5 bg-white dark:bg-neutral-900" : "bg-white dark:bg-neutral-400"
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Rate Limiting</p>
                <p className="text-xs text-neutral-500">Limit API request frequency</p>
              </div>
            </label>

            {security.rateLimitEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Window (seconds)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={security.rateLimitWindow}
                    onChange={(e) => setSecurity((p) => ({ ...p, rateLimitWindow: parseInt(e.target.value) || 60 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Requests</Label>
                  <Input
                    type="number"
                    min={1}
                    value={security.rateLimitMax}
                    onChange={(e) => setSecurity((p) => ({ ...p, rateLimitMax: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>IP Bans</Label>
              <div className="flex gap-2">
                <Input
                  value={newBan}
                  onChange={(e) => setNewBan(e.target.value)}
                  placeholder="192.168.1.1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBan())}
                />
                <Button variant="secondary" onClick={addBan} type="button">
                  <Upload className="size-4" />
                  Add
                </Button>
              </div>
              {security.ipBans.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {security.ipBans.map((ip) => (
                    <span
                      key={ip}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 dark:bg-white/10 text-sm text-neutral-700 dark:text-neutral-300"
                    >
                      {ip}
                      <button
                        onClick={() => removeBan(ip)}
                        className="text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button onClick={saveSecurity} loading={saving}>
                <FloppyDisk className="size-4" />
                Save Security
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
