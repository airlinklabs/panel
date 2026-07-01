import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowRight,
  BookOpen,
  DiscordLogo,
  GithubLogo,
  CreditCard,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";

interface SystemStats {
  servers: number;
  nodes: number;
  users: number;
  images: number;
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
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
}

export function AdminOverviewPage() {
  const [stats, setStats] = useState<SystemStats>({ servers: 0, nodes: 0, users: 0, images: 0 });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [branch, setBranch] = useState<"stable" | "dev">("stable");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ data: SystemStats }>("/admin/stats");
      setStats(res.data || { servers: 0, nodes: 0, users: 0, images: 0 });
    } catch {
      // silent
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
      const start = performance.now();
      try {
        await fetch("/api/v1/ping", { credentials: "same-origin" });
        setLatency(Math.round(performance.now() - start));
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

  const latencyPct = latency !== null ? Math.min((latency / 500) * 100, 100) : 0;
  const latencyColor = latency !== null ? (latency < 100 ? "bg-emerald-500" : latency < 300 ? "bg-amber-500" : "bg-red-500") : "bg-neutral-400";

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto pt-16">
        <div className="px-12 pt-6 pb-8">
          <div className="mb-6">
            <h1 className="text-base font-medium text-neutral-800 dark:text-white">About</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Panel information and credits.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <a href="/admin/users" className="group relative overflow-hidden rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 px-4 py-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Users</p>
                <ArrowRight size={14} className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-neutral-800 dark:text-white tabular-nums">{stats.users}</p>
              <p className="text-xs text-neutral-500 mt-1.5">Registered</p>
            </a>
            <a href="/admin/servers" className="group relative overflow-hidden rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 px-4 py-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Servers</p>
                <ArrowRight size={14} className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-neutral-800 dark:text-white tabular-nums">{stats.servers}</p>
              <p className="text-xs text-neutral-500 mt-1.5">Active instances</p>
            </a>
            <a href="/admin/nodes" className="group relative overflow-hidden rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 px-4 py-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Nodes</p>
                <ArrowRight size={14} className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-neutral-800 dark:text-white tabular-nums">{stats.nodes}</p>
              <p className="text-xs text-neutral-500 mt-1.5">Connected nodes</p>
            </a>
            <a href="/admin/images" className="group relative overflow-hidden rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 px-4 py-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Images</p>
                <ArrowRight size={14} className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-neutral-800 dark:text-white tabular-nums">{stats.images}</p>
              <p className="text-xs text-neutral-500 mt-1.5">Available images</p>
            </a>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-5 mb-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <img src="/assets/airlink_logo.png" className="h-10 w-10 rounded-xl shrink-0" alt="Airlink" />
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-white">Airlink Panel</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 text-neutral-600 dark:text-neutral-400">v{updateInfo?.currentVersion || "..."}</span>
                    <span className="text-[10px] text-neutral-500">production</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl overflow-hidden border border-neutral-200 dark:border-white/10 text-xs">
                  <button
                    onClick={() => setBranch("stable")}
                    className={`px-3 py-1.5 font-medium transition ${branch === "stable" ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300" : "text-neutral-500 dark:text-neutral-500"}`}
                  >
                    Stable
                  </button>
                  <button
                    onClick={() => setBranch("dev")}
                    className={`px-3 py-1.5 font-medium transition ${branch === "dev" ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300" : "text-neutral-500 dark:text-neutral-500"}`}
                  >
                    Dev
                  </button>
                </div>
                <button
                  onClick={checkUpdate}
                  disabled={checkingUpdate}
                  className="rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-4 py-2 text-sm font-medium transition"
                >
                  {checkingUpdate ? "Checking..." : "Check Updates"}
                </button>
                {updateInfo?.hasUpdate && (
                  <button
                    onClick={performUpdate}
                    disabled={updating}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition"
                  >
                    {updating ? "Installing..." : "Update"}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 p-4">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3">API Response Time</p>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono text-neutral-700 dark:text-neutral-300">{latency !== null ? `${latency} ms` : "-- ms"}</span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-700/40 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${latencyColor}`} style={{ width: `${latencyPct}%` }} />
                </div>
              </div>

              <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 p-4">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Update Status</p>
                <p className="text-xs text-neutral-500 mb-3">
                  Current version: <span className="text-neutral-700 dark:text-neutral-300 font-medium">{updateInfo?.currentVersion || "..."}</span>
                </p>
                {updateInfo?.hasUpdate && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Update available: v{updateInfo.latestVersion}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <a href="https://discord.gg/BybfXms7JZ" target="_blank" rel="noopener noreferrer" className="group rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <DiscordLogo size={16} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Discord</p>
              </div>
              <p className="text-xs text-neutral-500">Community support and discussions</p>
            </a>
            <a href="https://airlinklabs.xyz/" target="_blank" rel="noopener noreferrer" className="group rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={16} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Docs</p>
              </div>
              <p className="text-xs text-neutral-500">Usage and configuration guides</p>
            </a>
            <a href="https://github.com/airlinklabs" target="_blank" rel="noopener noreferrer" className="group rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <GithubLogo size={16} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">GitHub</p>
              </div>
              <p className="text-xs text-neutral-500">Source code and contributions</p>
            </a>
            <a href="https://ko-fi.com/airlinklabs" target="_blank" rel="noopener noreferrer" className="group rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={16} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Support</p>
              </div>
              <p className="text-xs text-neutral-500">Fund Airlink development</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
