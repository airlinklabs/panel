import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Cloud, Key, ArrowClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface CloudConfig {
  apiKey: string;
  backupEnabled: boolean;
}

export function AdminAirlinkCloudPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<CloudConfig>({
    apiKey: "",
    backupEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const fetchConfig = async () => {
    try {
      const res = await api.get<{ data: CloudConfig }>(
        "/api/admin/airlink-cloud"
      );
      setConfig(res.data);
      setApiKeyInput(res.data.apiKey);
    } catch {
      toast("Failed to load cloud settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/admin/airlink-cloud", {
        apiKey: apiKeyInput.trim(),
        backupEnabled: config.backupEnabled,
      });
      setConfig((prev) => ({
        ...prev,
        apiKey: apiKeyInput.trim(),
      }));
      toast("Cloud settings saved", "success");
    } catch {
      toast("Failed to save cloud settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBackupToggle = async (enabled: boolean) => {
    setConfig((prev) => ({ ...prev, backupEnabled: enabled }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
          Airlink Cloud
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Configure cloud integration and backup settings
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-xl bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="size-4" />
                Cloud API Key
              </CardTitle>
              <CardDescription>
                Your Airlink Cloud API key for remote management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cloud-api-key">API Key</Label>
                <Input
                  id="cloud-api-key"
                  type="password"
                  placeholder="Enter your cloud API key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </div>
              {config.apiKey && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="size-3.5" />
                  API key configured
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cloud className="size-4" />
                    Cloud Backups
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Automatically sync server backups to the cloud
                  </CardDescription>
                </div>
                <Switch
                  checked={config.backupEnabled}
                  onCheckedChange={handleBackupToggle}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "flex items-center gap-2 text-xs",
                  config.backupEnabled
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-500 dark:text-neutral-400"
                )}
              >
                {config.backupEnabled ? (
                  <CheckCircle className="size-3.5" />
                ) : (
                  <WarningCircle className="size-3.5" />
                )}
                {config.backupEnabled
                  ? "Cloud backups are enabled. DesktopTower backups will be synced automatically."
                  : "Cloud backups are disabled."}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} loading={saving}>
              Save Settings
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}
