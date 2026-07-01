import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Users,
  ArrowClockwise,
  TrendUp,
  HardDrives,
  ChartLineUp,
} from "@phosphor-icons/react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
);

interface PlayerStats {
  total: number;
  maxCapacity: number;
  servers: { name: string; players: number; maxPlayers: number }[];
  history: { date: string; total: number }[];
}

export function AdminPlayerStatsPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = async () => {
    try {
      const res = await api.get<{ data: PlayerStats }>(
        "/api/admin/playerstats"
      );
      setStats(res.data);
    } catch {
      toast("Failed to load player stats", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      await api.post("/api/admin/playerstats/collect");
      await fetchStats();
      toast("Player stats collected", "success");
    } catch {
      toast("Failed to collect stats", "error");
    } finally {
      setCollecting(false);
    }
  };

  const utilization =
    stats && stats.maxCapacity > 0
      ? Math.round((stats.total / stats.maxCapacity) * 100)
      : 0;

  const chartData = stats
    ? {
        labels: stats.history.map((h) =>
          new Date(h.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        ),
        datasets: [
          {
            label: "Players",
            data: stats.history.map((h) => h.total),
            borderColor: "rgb(99, 102, 241)",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "rgb(99, 102, 241)",
            pointBorderColor: "rgb(255, 255, 255)",
            pointBorderWidth: 2,
          },
        ],
      }
    : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgb(23, 23, 23)",
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 10,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#a3a3a3", maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { font: { size: 11 }, color: "#a3a3a3" },
      },
    },
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
            Player Statistics
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Track player counts across all servers. Auto-refreshes
            every 5 minutes.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleCollect}
          loading={collecting}
        >
          <ArrowClockwise className="size-4" />
          Collect Now
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Total Players
                      </p>
                      <p className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">
                        {formatNumber(stats?.total ?? 0)}
                      </p>
                    </div>
                    <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                      <Users
                        className="size-5 text-blue-500"
                        weight="duotone"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Max Capacity
                      </p>
                      <p className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">
                        {formatNumber(stats?.maxCapacity ?? 0)}
                      </p>
                    </div>
                    <div className="size-10 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                      <HardDrives
                        className="size-5 text-violet-500"
                        weight="duotone"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Utilization
                      </p>
                      <p
                        className={cn(
                          "text-2xl font-semibold mt-1",
                          utilization > 80
                            ? "text-red-600 dark:text-red-400"
                            : utilization > 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {utilization}%
                      </p>
                    </div>
                    <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                      <TrendUp
                        className="size-5 text-emerald-500"
                        weight="duotone"
                      />
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${utilization}%` }}
                      transition={{
                        duration: 0.8,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={cn(
                        "h-full rounded-full",
                        utilization > 80
                          ? "bg-red-500"
                          : utilization > 50
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ChartLineUp className="size-4" />
                Player History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData && stats.history.length > 0 ? (
                <div className="h-64">
                  <Line data={chartData} options={chartOptions} />
                </div>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                  No historical data yet. Click "Collect Now" to
                  start gathering stats.
                </p>
              )}
            </CardContent>
          </Card>

          {stats.servers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Server Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.servers
                    .sort((a, b) => b.players - a.players)
                    .map((server) => {
                      const pct =
                        server.maxPlayers > 0
                          ? Math.round(
                              (server.players / server.maxPlayers) *
                                100
                            )
                          : 0;
                      return (
                        <div
                          key={server.name}
                          className="flex items-center gap-4"
                        >
                          <span className="text-sm text-neutral-900 dark:text-white min-w-[140px] truncate">
                            {server.name}
                          </span>
                          <div className="flex-1 h-2 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 w-16 text-right tabular-nums">
                            {server.players}/{server.maxPlayers}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
}
