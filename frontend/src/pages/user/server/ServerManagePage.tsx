import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Play, Stop, ArrowsCounterClockwise, Copy, Check } from "@phosphor-icons/react";
import { cn, formatUptime } from "@/lib/utils";
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
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler);

interface ServerStatus {
  online: boolean;
  starting: boolean;
  stopping: boolean;
  uptime: number | null;
  startedAt: string | null;
  daemonOffline?: boolean;
  error?: string;
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
  Suspended: boolean;
  node: { id: number; name: string; address?: string };
  owner: { id: number; username: string };
  image: { name: string; info: string | null };
}

const termTheme = {
  foreground: "#c5c9d1",
  background: "#141414",
  selectionBackground: "#5DA5D580",
  black: "#1E1E1D",
  brightBlack: "#262625",
  red: "#E54B4B",
  green: "#9ECE58",
  yellow: "#FAED70",
  blue: "#396FE2",
  magenta: "#BB80B3",
  cyan: "#2DDAFD",
  white: "#d0d0d0",
  brightRed: "#FF5370",
  brightGreen: "#C3E88D",
  brightYellow: "#FFCB6B",
  brightBlue: "#82AAFF",
  brightMagenta: "#C792EA",
  brightCyan: "#89DDFF",
  brightWhite: "#ffffff",
  cursor: "#c5c9d1",
  cursorAccent: "#141414",
};

export function ServerManagePage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [powerLoading, setPowerLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState("");
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const cpuHistoryRef = useRef<number[]>(Array(30).fill(0));
  const ramHistoryRef = useRef<number[]>(Array(30).fill(0));
  const [cpuData, setCpuData] = useState<number[]>(Array(30).fill(0));
  const [ramData, setRamData] = useState<number[]>(Array(30).fill(0));
  const [ramUsage, setRamUsage] = useState("0% (0 MB / 0 MB)");
  const [cpuUsage, setCpuUsage] = useState("0%");
  const [diskUsage, setDiskUsage] = useState("-");
  const [statusText, setStatusText] = useState("-");
  const [statusColor, setStatusColor] = useState("text-neutral-800 dark:text-white");

  const fetchStatus = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/status`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.online) {
          setStatusText("Online");
          setStatusColor("text-emerald-500");
        } else if (data.starting) {
          setStatusText("Starting");
          setStatusColor("text-amber-500");
        } else if (data.stopping) {
          setStatusText("Stopping");
          setStatusColor("text-red-500");
        } else {
          setStatusText("Offline");
          setStatusColor("text-red-500");
        }
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

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerminal({
      disableStdin: true,
      lineHeight: 1.35,
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      theme: termTheme,
      scrollback: 1000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);

    requestAnimationFrame(() => fitAddon.fit());

    window.addEventListener("resize", () => fitAddon.fit());
    xtermRef.current = term;

    return () => {
      term.dispose();
    };
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!id) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/console/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      if (xtermRef.current) {
        const text = typeof event.data === "string" ? event.data : String(event.data);
        xtermRef.current.write(text);
      }
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      wsRef.current = null;
      reconnectAttempts.current++;
      const delay = Math.min(30000, 2000 * Math.pow(1.5, reconnectAttempts.current - 1));
      reconnectTimer.current = setTimeout(connectWebSocket, delay);
    };
  }, [id]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const sendCommand = () => {
    if (!command.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (xtermRef.current) {
      xtermRef.current.write(`\u001b[1m\u001b[33m~ \u001b[0m${command}\r\n`);
    }
    wsRef.current.send(JSON.stringify({ event: "CMD", command: command.trim() }));
    setCommand("");
  };

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
      toast(`${action.charAt(0).toUpperCase() + action.slice(1)} initiated`, "success");
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to ${action} server`, "error");
    } finally {
      setPowerLoading(null);
    }
  };

  const getServerIP = () => {
    if (!server) return "";
    const nodeAddr = server.node?.address || "";
    try {
      const ports = JSON.parse(server.Ports || "[]");
      const primary = ports.find((p: { primary: boolean }) => p.primary);
      const port = primary ? (primary.externalPort || String(primary.Port || "").split(":")[0]) : "";
      return `${nodeAddr}:${port}`;
    } catch {
      return nodeAddr;
    }
  };

  const copyServerIP = () => {
    const ip = getServerIP();
    if (ip) {
      navigator.clipboard.writeText(ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const makeChartData = (data: number[]) => ({
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
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } },
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
          <div className="flex gap-4">
            <div className="h-96 bg-neutral-200 dark:bg-white/10 rounded-xl flex-[2]" />
            <div className="flex-1 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-neutral-200 dark:bg-white/10 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="sm:flex-auto">
            <div className="flex items-center">
              <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white truncate max-w-[300px]">
                {server?.name ? server.name.charAt(0).toUpperCase() + server.name.slice(1) : ""}
              </h1>
              {status && (
                <div className="ml-3">
                  {status.online ? (
                    <div className="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <span className="relative flex h-2 w-2 mr-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {status.uptime != null && typeof status.uptime === "number" ? (
                          <>Uptime: {formatUptime(status.uptime)}</>
                        ) : (
                          "Online"
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <span className="inline-flex h-2 w-2 rounded-full bg-red-500 mr-2" />
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Offline</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center mt-1">
              <p className="tracking-tight text-sm text-neutral-500 dark:text-neutral-400 truncate max-w-[400px]">
                {server?.description || ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 text-neutral-400 shrink-0">📦</span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[140px]">
                {server?.image?.name || "Unknown"}
              </span>
            </div>
            <span className="text-neutral-300 dark:text-neutral-600 text-[11px]">·</span>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 text-neutral-400 shrink-0">🖥</span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[100px]">
                {server?.node?.name || "Unknown"}
              </span>
            </div>
            <span className="text-neutral-300 dark:text-neutral-600 text-[11px]">·</span>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 text-neutral-400 shrink-0">#</span>
              <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                {server?.UUID?.split("-")[0] || ""}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => handlePower("start")}
            disabled={powerLoading === "start" || server?.Suspended}
            className={cn(
              "rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-sm font-medium shadow-sm transition",
              server?.Suspended && "opacity-50 cursor-not-allowed"
            )}
          >
            <Play className="size-4 inline-flex mr-1 text-emerald-100 mb-0.5" weight="fill" />
            Start
          </button>
          <button
            onClick={() => handlePower("restart")}
            disabled={powerLoading === "restart" || server?.Suspended}
            className={cn(
              "rounded-xl bg-neutral-800 dark:bg-neutral-600 hover:bg-neutral-700 dark:hover:bg-neutral-500 text-white px-3 py-2 text-sm font-medium shadow-sm transition",
              server?.Suspended && "opacity-50 cursor-not-allowed"
            )}
          >
            <ArrowsCounterClockwise className="size-4 inline-flex mr-1 text-white mb-0.5" />
            Restart
          </button>
          <button
            onClick={() => handlePower("stop")}
            disabled={powerLoading === "stop" || server?.Suspended}
            className={cn(
              "rounded-xl bg-red-600 hover:bg-red-500 text-white px-3 py-2 text-sm font-medium shadow-sm transition",
              server?.Suspended && "opacity-50 cursor-not-allowed"
            )}
          >
            <Stop className="size-4 inline-flex mr-1 text-red-100 mb-0.5" weight="fill" />
            Stop
          </button>
        </div>
      </div>

      {server?.Suspended && (
        <div className="mt-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="h-5 w-5 shrink-0 text-red-500">⚠</span>
          <div>
            <p className="text-sm font-medium text-red-500">This server&apos;s been grounded. Reach out to your admin if you think that&apos;s a mistake.</p>
            <p className="text-xs text-red-400">This server has been suspended by an administrator.</p>
          </div>
        </div>
      )}

      {status?.daemonOffline && (
        <div className="mt-3">
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="h-5 w-5 shrink-0 text-red-500">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-500">
                {status.error || "This node isn't talking to us right now. Check the daemon — it might just need a nudge."}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-xl transition"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      <div id="server-page-body" className="flex flex-col lg:flex-row mt-4">
        <div className="w-full lg:w-2/3 lg:pr-5 flex flex-col min-w-0">
          <div className="flex flex-col rounded-xl overflow-hidden border border-neutral-800 shadow-lg flex-1">
            <div className="flex items-center gap-2 px-3 py-2 dark:bg-neutral-800 border-b border-neutral-800 shrink-0">
              <span className="text-[11px] font-medium text-neutral-600 select-none tracking-wide">console</span>
            </div>
            <div className="dark:bg-neutral-900 flex-1 relative" style={{ minHeight: 420 }}>
              <div ref={terminalRef} className="w-full h-full" />
            </div>
          </div>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendCommand();
              }}
              placeholder="Type a command..."
              className="w-full px-4 py-3 bg-neutral-200 dark:bg-neutral-600/20 text-neutral-800 dark:text-white rounded-b-xl text-sm border-t border-neutral-600/20 placeholder:font-medium placeholder:text-neutral-600 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:focus:ring-white/10 focus:border-neutral-400 dark:focus:border-white/30 transition-shadow duration-150 relative z-10"
              style={{ background: "transparent" }}
            />
            <div className="absolute inset-0 px-4 py-3 text-sm pointer-events-none rounded-b-xl overflow-hidden bg-neutral-200 dark:bg-neutral-600/20 border-t border-neutral-600/20 z-0">
              <span className="invisible" />
              <span className="text-neutral-400 dark:text-neutral-500" />
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/3 mt-4 lg:mt-0 space-y-4 flex flex-col">
          <div className="stats-card relative overflow-hidden bg-white dark:bg-neutral-800/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700/30 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 group flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">IP Address:</h2>
                <p className="mt-1 text-sm font-medium font-mono tracking-tight text-neutral-800 dark:text-white break-all">
                  {getServerIP()}
                </p>
              </div>
              <button
                onClick={copyServerIP}
                title="Copy"
                className="shrink-0 mt-1 rounded-xl p-1.5 bg-neutral-100 dark:bg-neutral-700/50 hover:bg-neutral-200 dark:hover:bg-neutral-600/50 transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" weight="bold" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-neutral-500" />
                )}
              </button>
            </div>
          </div>

          <div className="stats-card relative overflow-hidden bg-white dark:bg-neutral-800/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700/30 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 group flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <canvas id="statusChart" className="absolute inset-0 w-full h-full" />
            <div className="relative z-10">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Status:</h2>
              <p className={cn("mt-1 text-lg font-medium tracking-tight leading-snug", statusColor)}>{statusText}</p>
            </div>
          </div>

          <div className="stats-card relative overflow-hidden bg-white dark:bg-neutral-800/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700/30 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 group flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 w-full h-full">
              <Line data={makeChartData(ramData)} options={chartOptions} />
            </div>
            <div className="relative z-10">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">RAM Usage:</h2>
              <p className="mt-1 text-lg font-medium tracking-tight text-neutral-800 dark:text-white">{ramUsage}</p>
            </div>
          </div>

          <div className="stats-card relative overflow-hidden bg-white dark:bg-neutral-800/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700/30 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 group flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 w-full h-full">
              <Line data={makeChartData(cpuData)} options={chartOptions} />
            </div>
            <div className="relative z-10">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">CPU Usage:</h2>
              <p className="mt-1 text-lg font-medium tracking-tight text-neutral-800 dark:text-white">{cpuUsage}</p>
            </div>
          </div>

          <div className="stats-card relative overflow-hidden bg-white dark:bg-neutral-800/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700/30 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 group flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <div className="relative z-10">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Disk Usage:</h2>
              <p className="mt-1 text-lg font-medium tracking-tight text-neutral-800 dark:text-white">{diskUsage}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
