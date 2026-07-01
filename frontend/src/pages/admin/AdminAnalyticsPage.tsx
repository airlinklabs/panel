import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ChartBar,
  Server,
  Users,
  ArrowRight,
  Clock,
  HardDrives,
  UserCircle,
  CaretRight,
} from "@phosphor-icons/react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface AnalyticsData {
  servers: { total: number; online: number; byNode: { name: string; count: number; online: number }[] };
  nodes: { total: number; online: number; offline: number };
  users: { total: number; newThisWeek: number };
  logins: { recent: { email: string; time: string }[] };
}

export function AdminAnalyticsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("servers");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get<{ data: AnalyticsData }>(
          "/api/admin/analytics/summary"
        );
        setData(res.data);
      } catch {
        toast("Failed to load analytics", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const chartData = data
    ? {
        labels: data.servers.byNode.map((n) => n.name),
        datasets: [
          {
            label: "Online",
            data: data.servers.byNode.map((n) => n.online),
            backgroundColor: "rgb(34, 197, 94)",
            borderRadius: 6,
            barPercentage: 0.6,
          },
          {
            label: "Offline",
            data: data.servers.byNode.map(
              (n) => n.count - n.online
            ),
            backgroundColor: "rgb(239, 68, 68)",
            borderRadius: 6,
            barPercentage: 0.6,
          },
        ],
      }
    : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          padding: 16,
          usePointStyle: true,
          pointStyle: "circle",
          font: { size: 12 },
        },
      },
      tooltip: {
        backgroundColor: "rgb(23, 23, 23)",
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#a3a3a3" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: {
          font: { size: 11 },
          color: "#a3a3a3",
          stepSize: 1,
        },
      },
    },
  };

  const statCards = data
    ? [
        {
          label: "Total Servers",
          value: data.servers.total,
          icon: Server,
          color: "text-blue-500",
        },
        {
          label: "Online Servers",
          value: data.servers.online,
          icon: HardDrives,
          color: "text-emerald-500",
        },
        {
          label: "Total Nodes",
          value: data.nodes.total,
          icon: HardDrives,
          color: "text-violet-500",
        },
        {
          label: "Total Users",
          value: data.users.total,
          icon: Users,
          color: "text-amber-500",
        },
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
          Analytics
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Overview of servers, nodes, and user activity
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: i * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {stat.label}
                        </p>
                        <p className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">
                          {formatNumber(stat.value)}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "size-10 rounded-lg flex items-center justify-center bg-neutral-50 dark:bg-white/[0.03]",
                          stat.color
                        )}
                      >
                        <stat.icon className="size-5" weight="duotone" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="servers">
                <Server className="size-4 mr-2" />
                Servers
              </TabsTrigger>
              <TabsTrigger value="nodes">
                <HardDrives className="size-4 mr-2" />
                Nodes
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Clock className="size-4 mr-2" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="users">
                <UserCircle className="size-4 mr-2" />
                Users
              </TabsTrigger>
            </TabsList>

            <TabsContent value="servers" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Servers by Node
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData ? (
                    <div className="h-64">
                      <Bar data={chartData} options={chartOptions} />
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                      No node data available
                    </p>
                  )}
                </CardContent>
              </Card>

              {data && data.servers.byNode.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Node</TableHead>
                          <TableHead className="text-right">
                            Online
                          </TableHead>
                          <TableHead className="text-right">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.servers.byNode.map((node) => (
                          <TableRow key={node.name}>
                            <TableCell className="font-medium">
                              {node.name}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="success">
                                {node.online}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {node.count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="nodes" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="text-center p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.03]">
                      <p className="text-3xl font-semibold text-neutral-900 dark:text-white">
                        {data?.nodes.total ?? 0}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Total Nodes
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                      <p className="text-3xl font-semibold text-emerald-700 dark:text-emerald-400">
                        {data?.nodes.online ?? 0}
                      </p>
                      <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
                        Online
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-red-50 dark:bg-red-500/10">
                      <p className="text-3xl font-semibold text-red-700 dark:text-red-400">
                        {data?.nodes.offline ?? 0}
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-500 mt-1">
                        Offline
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Recent Logins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.logins.recent &&
                  data.logins.recent.length > 0 ? (
                    <div className="space-y-3">
                      {data.logins.recent.map((login, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-neutral-200/30 dark:border-white/[0.07] last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                              <UserCircle className="size-4 text-neutral-500 dark:text-neutral-400" />
                            </div>
                            <span className="text-sm text-neutral-900 dark:text-white">
                              {login.email}
                            </span>
                          </div>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {new Date(
                              login.time
                            ).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-6">
                      No recent logins
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="text-center p-6 rounded-xl bg-neutral-50 dark:bg-white/[0.03]">
                      <p className="text-4xl font-semibold text-neutral-900 dark:text-white">
                        {formatNumber(data?.users.total ?? 0)}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                        Total Users
                      </p>
                    </div>
                    <div className="text-center p-6 rounded-xl bg-blue-50 dark:bg-blue-500/10">
                      <p className="text-4xl font-semibold text-blue-700 dark:text-blue-400">
                        {formatNumber(
                          data?.users.newThisWeek ?? 0
                        )}
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-500 mt-2">
                        New This Week
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </motion.div>
  );
}
