import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, HardDrives, Server } from "@phosphor-icons/react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { api } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface NodeInfo {
  id: number;
  name: string;
  memory: number;
  disk: number;
  address: string;
  status?: string;
}

interface ServerInfo {
  uuid: string;
  name: string;
  status: string;
  memory: number;
  cpu: number;
  allocatedMemory?: number;
  allocatedCpu?: number;
}

interface StatsData {
  node: NodeInfo;
  servers: ServerInfo[];
  usage?: {
    timestamps: string[];
    memory: number[];
    cpu: number[];
  };
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
    },
  },
  scales: {
    x: {
      display: false,
    },
    y: {
      display: false,
    },
  },
  elements: {
    point: {
      radius: 0,
    },
    line: {
      tension: 0.4,
      borderWidth: 2,
    },
  },
};

function UsageChart({
  data,
  label,
  color,
  max,
}: {
  data: number[];
  label: string;
  color: string;
  max: number;
}) {
  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [
      {
        data,
        borderColor: color,
        backgroundColor: color.replace("1)", "0.1)"),
        fill: true,
      },
    ],
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-neutral-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white mb-3">
          {data.length > 0 ? `${data[data.length - 1]}%` : "--"}
        </div>
        <div className="h-32">
          {data.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-neutral-400">
              No data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminNodeStatsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: StatsData }>(`/admin/nodes/stats/${id}`);
      setStats(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const memUsage = stats.usage?.memory || [];
  const cpuUsage = stats.usage?.cpu || [];
  const totalAllocatedMem = stats.servers.reduce((sum, s) => sum + (s.allocatedMemory || 0), 0);
  const totalAllocatedCpu = stats.servers.reduce((sum, s) => sum + (s.allocatedCpu || 0), 0);

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/nodes")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.node.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{stats.node.address}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">Memory</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-neutral-900 dark:text-white">
              {totalAllocatedMem} / {stats.node.memory} MB
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min((totalAllocatedMem / stats.node.memory) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">Disk</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-neutral-900 dark:text-white">
              {formatBytes(stats.node.disk * 1024 * 1024)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">Servers</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-neutral-900 dark:text-white">
              {stats.servers.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">CPU Allocated</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-neutral-900 dark:text-white">
              {totalAllocatedCpu}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UsageChart data={cpuUsage} label="CPU Usage" color="rgba(139,92,246,1)" max={100} />
        <UsageChart data={memUsage} label="Memory Usage" color="rgba(59,130,246,1)" max={stats.node.memory} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4 text-neutral-400" />
            Servers on this Node ({stats.servers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.servers.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400">No servers on this node</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/30 dark:border-white/[0.07]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase hidden sm:table-cell">Memory</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase hidden sm:table-cell">CPU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
                  {stats.servers.map((srv) => (
                    <tr key={srv.uuid} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">{srv.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={srv.status === "running" ? "success" : srv.status === "stopped" ? "neutral" : "warning"}>
                          {srv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 tabular-nums hidden sm:table-cell">
                        {srv.allocatedMemory || srv.memory} / {srv.memory} MB
                      </td>
                      <td className="px-4 py-3 text-neutral-500 tabular-nums hidden sm:table-cell">
                        {srv.allocatedCpu || srv.cpu} / {srv.cpu}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
