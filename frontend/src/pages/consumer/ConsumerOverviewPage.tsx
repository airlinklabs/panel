import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  Play,
  Stop,
  ArrowClockwise,
  Power,
  HardDrive,
  Cpu,
  MemoryStick,
  Plus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { BadgeStatus, type StatusType } from "@/components/ui/badge-status";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ConsumerServer {
  uuid: string;
  name: string;
  status: StatusType;
  cpu: number;
  memory: number;
  disk: number;
  maxMemory: number;
  maxDisk: number;
  node: string;
  image: string;
}

export function ConsumerOverviewPage() {
  const { toast } = useToast();
  const [servers, setServers] = useState<ConsumerServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [powerAction, setPowerAction] = useState<string | null>(null);

  const fetchServers = async () => {
    try {
      const res = await api.get<{ data: ConsumerServer[] }>(
        "/api/consumer/v1/servers"
      );
      setServers(res.data);
    } catch {
      toast("Failed to load servers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handlePower = async (uuid: string, action: "start" | "stop" | "restart" | "kill") => {
    setPowerAction(`${uuid}-${action}`);
    try {
      await api.post(`/api/consumer/v1/servers/${uuid}/power`, { action });
      toast(`Server ${action} initiated`, "success");
      setTimeout(fetchServers, 2000);
    } catch {
      toast(`Failed to ${action} server`, "error");
    } finally {
      setPowerAction(null);
    }
  };

  const stats = {
    total: servers.length,
    online: servers.filter((s) => s.status === "online").length,
    offline: servers.filter((s) => s.status === "offline").length,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
            My Servers
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Manage and monitor your game servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchServers}
          >
            <ArrowClockwise className="size-4" />
            Refresh
          </Button>
          <a href="/consumer/create-server">
            <Button size="sm">
              <Plus className="size-4" />
              New Server
            </Button>
          </a>
        </div>
      </div>

      {!loading && servers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total", value: stats.total, color: "text-blue-500" },
            { label: "Online", value: stats.online, color: "text-emerald-500" },
            { label: "Offline", value: stats.offline, color: "text-red-500" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      {stat.label}
                    </p>
                    <p className={cn("text-xl font-semibold", stat.color)}>
                      {stat.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-xl bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Server className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
              You don't have any servers yet
            </p>
            <a href="/consumer/create-server">
              <Button size="sm" className="mt-4">
                <Plus className="size-4" />
                Create your first server
              </Button>
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {servers.map((server, i) => (
              <motion.div
                key={server.uuid}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <Card className="hover:border-neutral-300 dark:hover:border-white/15 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                          <Server className="size-5 text-neutral-500 dark:text-neutral-400" />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {server.name}
                          </CardTitle>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            {server.node}
                          </p>
                        </div>
                      </div>
                      <BadgeStatus status={server.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          <Cpu className="size-3" />
                          CPU
                        </div>
                        <div className="h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              server.cpu > 80 ? "bg-red-500" : "bg-blue-500"
                            )}
                            style={{ width: `${Math.min(server.cpu, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                          {server.cpu}%
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          <MemoryStick className="size-3" />
                          Memory
                        </div>
                        <div className="h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              server.memory / server.maxMemory > 0.8
                                ? "bg-red-500"
                                : "bg-violet-500"
                            )}
                            style={{
                              width: `${Math.min(
                                (server.memory / server.maxMemory) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                          {formatBytes(server.memory)} / {formatBytes(server.maxMemory)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          <HardDrive className="size-3" />
                          Disk
                        </div>
                        <div className="h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              server.disk / server.maxDisk > 0.8
                                ? "bg-red-500"
                                : "bg-amber-500"
                            )}
                            style={{
                              width: `${Math.min(
                                (server.disk / server.maxDisk) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                          {formatBytes(server.disk)} / {formatBytes(server.maxDisk)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {server.status === "offline" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handlePower(server.uuid, "start")}
                          loading={powerAction === `${server.uuid}-start`}
                        >
                          <Play className="size-3.5" />
                          Start
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePower(server.uuid, "restart")}
                            loading={powerAction === `${server.uuid}-restart`}
                          >
                            <ArrowClockwise className="size-3.5" />
                            Restart
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePower(server.uuid, "stop")}
                            loading={powerAction === `${server.uuid}-stop`}
                          >
                            <Stop className="size-3.5" />
                            Stop
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
