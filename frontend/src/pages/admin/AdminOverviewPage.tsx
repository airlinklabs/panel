import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ChartLineUp,
  CircleDashed,
  Folder,
  HardDrives,
  Server,
  Users,
  ArrowClockwise,
  Wifi,
  Warning,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SystemStats {
  servers: number;
  nodes: number;
  users: number;
  onlineServers?: number;
}

interface NodeInfo {
  id: number;
  name: string;
  address: string;
  memory: number;
  disk: number;
  status?: string;
}

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
}

interface SystemStatus {
  user: { id: number; username: string; isAdmin: boolean };
  servers: number;
  nodes: number;
  settings: Record<string, unknown>;
  stats: SystemStats;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  index,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  index: number;
}) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="relative overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{label}</p>
              <p className="text-3xl font-bold tabular-nums mt-1 text-neutral-900 dark:text-white">
                {typeof value === "number" ? formatNumber(value) : value}
              </p>
            </div>
            <div className={cn("p-3 rounded-xl", color)}>
              <Icon className="size-6" weight="light" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-12 opacity-[0.03] pointer-events-none">
            <svg viewBox="0 0 200 40" className="w-full h-full">
              <path
                d={`M0,${30 + index * 3} Q25,${20 - index * 2} 50,${25 + index} T100,${20 + index * 2} T150,${28 - index} T200,${22 + index}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-neutral-900 dark:text-white"
              />
            </svg>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AdminOverviewPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, nodesRes] = await Promise.all([
        api.get<{ data: SystemStatus }>("/api/system/status"),
        api.get<{ data: NodeInfo[] }>("/admin/nodes/list").catch(() => ({ data: [] })),
      ]);
      const s = statusRes.data;
      setStats({
        servers: s.stats?.servers ?? s.servers ?? 0,
        nodes: s.stats?.nodes ?? s.nodes ?? 0,
        users: s.stats?.users ?? 0,
        onlineServers: s.stats?.onlineServers ?? 0,
      });
      setNodes(nodesRes.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const res = await api.get<{ data: UpdateInfo }>("/admin/check-update");
      setUpdateInfo(res.data);
    } catch {
      // silent
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  const performUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      await api.post("/admin/perform-update");
      window.location.reload();
    } catch {
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    checkUpdate();
  }, [fetchData, checkUpdate]);

  useEffect(() => {
    const ping = async () => {
      const start = Date.now();
      try {
        await fetch("/api/system/status", { credentials: "same-origin" });
        const ms = Date.now() - start;
        setLatency(ms);
        setLatencyHistory((prev) => [...prev.slice(-29), ms]);
      } catch {
        setLatency(null);
      }
    };
    ping();
    intervalRef.current = setInterval(ping, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Admin Overview</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            System status and monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updateInfo?.updateAvailable && (
            <Button variant="danger" size="sm" onClick={performUpdate} loading={updating}>
              Update to {updateInfo.latestVersion}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={checkUpdate} loading={checkingUpdate}>
            <ArrowClockwise className="size-4" />
            Check Update
          </Button>
        </div>
      </motion.div>

      {updateInfo && (
        <motion.div variants={fadeUp}>
          <Card
            className={cn(
              updateInfo.updateAvailable
                ? "border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5"
                : "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5"
            )}
          >
            <CardContent className="p-4 flex items-center gap-3">
              {updateInfo.updateAvailable ? (
                <Warning className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <CircleDashed className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {updateInfo.updateAvailable
                  ? `Version ${updateInfo.latestVersion} is available (current: ${updateInfo.currentVersion})`
                  : `Running latest version ${updateInfo.currentVersion}`}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        variants={stagger}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          label="Total Servers"
          value={stats?.servers ?? 0}
          icon={Server}
          color="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
          index={0}
        />
        <StatCard
          label="Online Servers"
          value={stats?.onlineServers ?? 0}
          icon={Wifi}
          color="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          index={1}
        />
        <StatCard
          label="Total Nodes"
          value={stats?.nodes ?? 0}
          icon={HardDrives}
          color="bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
          index={2}
        />
        <StatCard
          label="Total Users"
          value={stats?.users ?? 0}
          icon={Users}
          color="bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          index={3}
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChartLineUp className="size-5 text-neutral-400" />
                API Latency
                {latency !== null && (
                  <Badge variant={latency < 200 ? "success" : latency < 500 ? "warning" : "danger"}>
                    {latency}ms
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 flex items-end gap-px">
                {latencyHistory.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
                    Collecting data...
                  </div>
                ) : (
                  latencyHistory.map((ms, i) => {
                    const max = Math.max(...latencyHistory, 100);
                    const h = Math.max((ms / max) * 100, 4);
                    return (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                          "flex-1 rounded-t-sm",
                          ms < 200
                            ? "bg-emerald-400 dark:bg-emerald-500"
                            : ms < 500
                            ? "bg-amber-400 dark:bg-amber-500"
                            : "bg-red-400 dark:bg-red-500"
                        )}
                      />
                    );
                  })
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-2">Last 30 pings (every 30s)</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrives className="size-5 text-neutral-400" />
                Node Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : nodes.length === 0 ? (
                <div className="text-center py-8">
                  <Folder className="size-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                  <p className="text-sm text-neutral-400">No nodes configured</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nodes.slice(0, 8).map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-100 dark:border-white/[0.04]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "size-2 rounded-full shrink-0",
                          node.status === "online" ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"
                        )} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{node.name}</p>
                          <p className="text-xs text-neutral-400 truncate">{node.address}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-neutral-500">{node.memory}MB</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
