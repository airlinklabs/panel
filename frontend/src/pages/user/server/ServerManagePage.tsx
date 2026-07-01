import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play,
  Stop,
  RotateCcw,
  Power,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowRight,
  Loader2,
} from "@phosphor-icons/react";
import { cn, formatUptime, formatBytes } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler);

interface ServerStatus {
  online: boolean;
  starting: boolean;
  stopping: boolean;
  uptime: number | null;
  startedAt: string | null;
}

interface ServerInfo {
  UUID: string;
  name: string;
  description: string | null;
  Memory: number;
  Cpu: number;
  Storage: number;
  Ports: string;
  StartCommand: string | null;
  dockerImage: string | null;
  node: { id: number; name: string };
  owner: { id: number; username: string };
  image: { name: string; info: string | null };
}

const statusConfig: Record<string, { color: string; label: string }> = {
  online: { color: "bg-emerald-500", label: "Online" },
  starting: { color: "bg-amber-500", label: "Starting" },
  stopping: { color: "bg-orange-500", label: "Stopping" },
  offline: { color: "bg-red-500", label: "Offline" },
};

function StatCard({
  label,
  value,
  max,
  icon: Icon,
  unit,
  data,
}: {
  label: string;
  value: number;
  max: number;
  icon: React.ElementType;
  unit: string;
  data: number[];
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [
      {
        data,
        borderColor: "rgba(115,115,115,0.3)",
        backgroundColor: "rgba(115,115,115,0.05)",
        borderWidth: 1.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, min: 0, max: 100 },
    },
  };

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-neutral-400 dark:text-neutral-500" />
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {label}
          </span>
        </div>
        <span className="text-sm font-medium text-neutral-900 dark:text-white tabular-nums">
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <div className="h-12 mb-2">
        <Line data={chartData} options={chartOptions} />
      </div>
      <div className="h-1.5 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            percentage > 80 ? "bg-red-500" : percentage > 60 ? "bg-amber-500" : "bg-neutral-400 dark:bg-neutral-500"
          )}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}

export function ServerManagePage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [powerLoading, setPowerLoading] = useState<string | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(20).fill(0));
  const [ramHistory, setRamHistory] = useState<number[]>(Array(20).fill(0));
  const [diskHistory] = useState<number[]>(Array(20).fill(0));

  const fetchStatus = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/status`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silently fail
    }
  }, [id]);

  const fetchServer = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setServer(data.server);
      }
    } catch {
      toast("Failed to load server details", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchServer();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchServer, fetchStatus]);

  const handlePower = async (action: "start" | "stop" | "restart") => {
    if (!id) return;
    setPowerLoading(action);
    try {
      const res = await fetch(`/server/${id}/power/${action}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} server`);
      }
      toast(`Server ${action} initiated`, "success");
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to ${action} server`, "error");
    } finally {
      setPowerLoading(null);
    }
  };

  const statusInfo = status
    ? status.online
      ? statusConfig.online
      : status.starting
      ? statusConfig.starting
      : status.stopping
      ? statusConfig.stopping
      : statusConfig.offline
    : statusConfig.offline;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-neutral-200 dark:bg-white/10 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
              {server?.name || "Server"}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("size-2 rounded-full", statusInfo.color)} />
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {statusInfo.label}
              </span>
              {status?.uptime != null && status.uptime > 0 && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  · {formatUptime(status.uptime)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePower("start")}
              disabled={powerLoading === "start" || (status?.online === true && !status?.stopping)}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
            >
              {powerLoading === "start" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Start
            </button>
            <button
              onClick={() => handlePower("stop")}
              disabled={powerLoading === "stop" || !status?.online}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
            >
              {powerLoading === "stop" ? <Loader2 className="size-4 animate-spin" /> : <Stop className="size-4" />}
              Stop
            </button>
            <button
              onClick={() => handlePower("restart")}
              disabled={powerLoading === "restart" || !status?.online}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
            >
              {powerLoading === "restart" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Restart
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="CPU"
            value={parseFloat(cpuHistory[cpuHistory.length - 1]?.toFixed(1) || "0")}
            max={100}
            icon={Cpu}
            unit="%"
            data={cpuHistory}
          />
          <StatCard
            label="Memory"
            value={parseFloat(ramHistory[ramHistory.length - 1]?.toFixed(1) || "0")}
            max={100}
            icon={MemoryStick}
            unit="%"
            data={ramHistory}
          />
          <StatCard
            label="Disk"
            value={0}
            max={100}
            icon={HardDrive}
            unit="%"
            data={diskHistory}
          />
        </div>

        <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6 mb-6">
          <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
            Server Info
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Node</span>
              <span className="text-neutral-900 dark:text-white">{server?.node?.name || "N/A"}</span>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Image</span>
              <span className="text-neutral-900 dark:text-white">{server?.image?.name || "N/A"}</span>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Owner</span>
              <span className="text-neutral-900 dark:text-white">{server?.owner?.username || "N/A"}</span>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Memory</span>
              <span className="text-neutral-900 dark:text-white">{server?.Memory || 0}MB</span>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">CPU</span>
              <span className="text-neutral-900 dark:text-white">{server?.Cpu || 0}%</span>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Storage</span>
              <span className="text-neutral-900 dark:text-white">{formatBytes((server?.Storage || 0) * 1024 * 1024)}</span>
            </div>
            {status?.startedAt && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-neutral-500 dark:text-neutral-400 block mb-0.5">Started at</span>
                <span className="text-neutral-900 dark:text-white">
                  {new Date(status.startedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { to: `/server/${id}/console`, label: "Console" },
            { to: `/server/${id}/files`, label: "Files" },
            { to: `/server/${id}/players`, label: "Players" },
            { to: `/server/${id}/backups`, label: "Backups" },
            { to: `/server/${id}/settings`, label: "Settings" },
            { to: `/server/${id}/startup`, label: "Startup" },
            { to: `/server/${id}/tasks`, label: "Tasks" },
            { to: `/server/${id}/access`, label: "Access" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-3 hover:border-neutral-300 dark:hover:border-white/[0.12] transition-colors flex items-center justify-between group"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                {item.label}
              </span>
              <ArrowRight className="size-3.5 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors" />
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
