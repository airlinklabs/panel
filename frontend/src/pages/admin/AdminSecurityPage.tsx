import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Plus,
  Trash,
  Globe,
  WarningCircle,
  CheckCircle,
  Lock,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface SecurityConfig {
  rateLimiting: { enabled: boolean; rpm: number };
  bannedIps: { ip: string; reason: string; bannedAt: string }[];
}

export function AdminSecurityPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SecurityConfig>({
    rateLimiting: { enabled: false, rpm: 60 },
    bannedIps: [],
  });
  const [loading, setLoading] = useState(true);
  const [savingRateLimit, setSavingRateLimit] = useState(false);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banning, setBanning] = useState(false);
  const [unbanning, setUnbanning] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await api.get<{ data: SecurityConfig }>(
        "/api/admin/security"
      );
      setConfig(res.data);
    } catch {
      toast("Failed to load security settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleRateLimitToggle = async (enabled: boolean) => {
    setSavingRateLimit(true);
    try {
      await api.post("/admin/security/rate-limit", {
        enabled,
        rpm: config.rateLimiting.rpm,
      });
      setConfig((prev) => ({
        ...prev,
        rateLimiting: { ...prev.rateLimiting, enabled },
      }));
      toast(
        `Rate limiting ${enabled ? "enabled" : "disabled"}`,
        "success"
      );
    } catch {
      toast("Failed to update rate limiting", "error");
    } finally {
      setSavingRateLimit(false);
    }
  };

  const handleRpmChange = async (rpm: number) => {
    if (rpm < 1) return;
    setSavingRateLimit(true);
    try {
      await api.post("/admin/security/rate-limit", {
        enabled: config.rateLimiting.enabled,
        rpm,
      });
      setConfig((prev) => ({
        ...prev,
        rateLimiting: { ...prev.rateLimiting, rpm },
      }));
      toast("RPM updated", "success");
    } catch {
      toast("Failed to update RPM", "error");
    } finally {
      setSavingRateLimit(false);
    }
  };

  const handleBan = async () => {
    if (!banIp.trim()) {
      toast("IP address is required", "error");
      return;
    }
    setBanning(true);
    try {
      await api.post("/admin/security/ban-ip", {
        ip: banIp.trim(),
        reason: banReason.trim() || undefined,
      });
      setConfig((prev) => ({
        ...prev,
        bannedIps: [
          ...prev.bannedIps,
          {
            ip: banIp.trim(),
            reason: banReason.trim(),
            bannedAt: new Date().toISOString(),
          },
        ],
      }));
      setBanIp("");
      setBanReason("");
      toast("IP banned", "success");
    } catch {
      toast("Failed to ban IP", "error");
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (ip: string) => {
    setUnbanning(ip);
    try {
      await api.post("/admin/security/unban-ip", { ip });
      setConfig((prev) => ({
        ...prev,
        bannedIps: prev.bannedIps.filter((b) => b.ip !== ip),
      }));
      toast("IP unbanned", "success");
    } catch {
      toast("Failed to unban IP", "error");
    } finally {
      setUnbanning(null);
    }
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
          Security
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Configure rate limiting and IP management
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="size-4" />
                    Rate Limiting
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Limit the number of requests per minute per IP
                  </CardDescription>
                </div>
                <Switch
                  checked={config.rateLimiting.enabled}
                  onCheckedChange={handleRateLimitToggle}
                  disabled={savingRateLimit}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="space-y-1 flex-1 max-w-xs">
                  <Label htmlFor="rpm">Requests per minute</Label>
                  <Input
                    id="rpm"
                    type="number"
                    min={1}
                    value={config.rateLimiting.rpm}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setConfig((prev) => ({
                          ...prev,
                          rateLimiting: {
                            ...prev.rateLimiting,
                            rpm: val,
                          },
                        }));
                      }
                    }}
                    onBlur={() =>
                      handleRpmChange(config.rateLimiting.rpm)
                    }
                    disabled={!config.rateLimiting.enabled}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    handleRpmChange(config.rateLimiting.rpm)
                  }
                  disabled={!config.rateLimiting.enabled}
                  loading={savingRateLimit}
                >
                  Save
                </Button>
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 text-xs",
                  config.rateLimiting.enabled
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-500 dark:text-neutral-400"
                )}
              >
                {config.rateLimiting.enabled ? (
                  <CheckCircle className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {config.rateLimiting.enabled
                  ? `Allowing ${config.rateLimiting.rpm} requests per minute`
                  : "Rate limiting is disabled"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="size-4" />
                IP Ban List
              </CardTitle>
              <CardDescription>
                Block specific IP addresses from accessing the
                panel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="IP address"
                  value={banIp}
                  onChange={(e) => setBanIp(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Reason (optional)"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleBan}
                  loading={banning}
                >
                  <Plus className="size-4" />
                  Ban
                </Button>
              </div>

              {config.bannedIps.length === 0 ? (
                <div className="py-8 text-center">
                  <Globe className="size-8 text-neutral-300 dark:text-neutral-600 mx-auto" />
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                    No IPs banned
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Reason
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Banned At
                      </TableHead>
                      <TableHead className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {config.bannedIps.map((ban) => (
                        <motion.tr
                          key={ban.ip}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-b border-neutral-200/30 dark:border-white/[0.07]"
                        >
                          <TableCell>
                            <code className="text-xs bg-neutral-100 dark:bg-white/5 px-2 py-1 rounded-lg text-neutral-900 dark:text-white font-mono">
                              {ban.ip}
                            </code>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm text-neutral-500 dark:text-neutral-400">
                              {ban.reason || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {new Date(
                                ban.bannedAt
                              ).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  handleUnban(ban.ip)
                                }
                                loading={unbanning === ban.ip}
                              >
                                <Trash className="size-4" />
                                Unban
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}
