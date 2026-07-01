import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { CircleDashed, Circle, ArrowLeft } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatUptime } from "@/lib/utils";
import { ServerSubNav } from "@/components/layout/ServerSubNav";

interface ServerData {
  id: number;
  name: string;
  status: "running" | "stopped" | "starting" | "stopping";
  uptime: number;
  node: { name: string };
  image: { name: string };
}

const statusConfig = {
  running: { label: "Running", color: "text-emerald-500", icon: Circle },
  stopped: { label: "Stopped", color: "text-neutral-400", icon: CircleDashed },
  starting: { label: "Starting", color: "text-amber-500", icon: Circle },
  stopping: { label: "Stopping", color: "text-amber-500", icon: CircleDashed },
} as const;

export function ServerLayout() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const basePath = `/server/${id}`;

  useEffect(() => {
    if (!id) return;
    fetch(`/server/${id}/status`, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch server");
        return r.json();
      })
      .then((data) => setServer(data.data))
      .catch(() => setServer(null))
      .finally(() => setLoading(false));
  }, [id]);

  const status = server ? statusConfig[server.status] : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      {/* DesktopTower header */}
      <div className="al-surface p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              {loading ? (
                <div className="h-6 w-40 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
              ) : (
                <h1 className="text-xl font-bold font-display text-neutral-900 dark:text-white truncate">
                  {server?.name ?? "DesktopTower"}
                </h1>
              )}
              {status && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                    "bg-neutral-100 dark:bg-white/5",
                    status.color
                  )}
                >
                  <status.icon className="size-3" weight="fill" />
                  {status.label}
                </span>
              )}
            </div>
            {!loading && server && (
              <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                <span>{server.node.name}</span>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span>{server.image.name}</span>
                {server.uptime > 0 && (
                  <>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span>Up {formatUptime(server.uptime)}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <ServerSubNav basePath={basePath} />

      {/* Content */}
      <Outlet />
    </div>
  );
}
