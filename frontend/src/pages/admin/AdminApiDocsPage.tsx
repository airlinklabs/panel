import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CaretRight,
  CaretDown,
  Copy,
  ArrowRight,
  CheckCircle,
  WarningCircle,
  Lock,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  permission: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/admin/analytics/summary",
    description: "Get server, node, and user analytics summary",
    permission: "admin",
  },
  {
    method: "GET",
    path: "/api/admin/playerstats",
    description: "Get player statistics and historical data",
    permission: "admin",
  },
  {
    method: "POST",
    path: "/api/admin/playerstats/collect",
    description: "Trigger a player stats collection",
    permission: "admin",
  },
  {
    method: "GET",
    path: "/api/v1/ping",
    description: "Test API latency",
    permission: "none",
  },
  {
    method: "GET",
    path: "/admin/addons/store/list",
    description: "List all available addons in the store",
    permission: "admin",
  },
  {
    method: "POST",
    path: "/admin/addons/store/install",
    description: "Install an addon by slug",
    permission: "admin",
    params: [
      { name: "slug", type: "string", required: true, description: "Addon slug" },
    ],
  },
  {
    method: "POST",
    path: "/admin/addons/store/uninstall",
    description: "Uninstall an addon by slug",
    permission: "admin",
    params: [
      { name: "slug", type: "string", required: true, description: "Addon slug" },
    ],
  },
  {
    method: "POST",
    path: "/admin/addons/toggle/:slug",
    description: "Enable or disable an installed addon",
    permission: "admin",
    params: [
      { name: "slug", type: "string", required: true, description: "Addon slug (path param)" },
    ],
  },
  {
    method: "POST",
    path: "/admin/addons/reload",
    description: "Reload all addons",
    permission: "admin",
  },
  {
    method: "POST",
    path: "/admin/security/rate-limit",
    description: "Configure rate limiting settings",
    permission: "admin",
    params: [
      { name: "enabled", type: "boolean", required: true, description: "Enable/disable rate limiting" },
      { name: "rpm", type: "number", required: false, description: "Requests per minute" },
    ],
  },
  {
    method: "POST",
    path: "/admin/security/ban-ip",
    description: "Ban an IP address",
    permission: "admin",
    params: [
      { name: "ip", type: "string", required: true, description: "IP address to ban" },
    ],
  },
  {
    method: "POST",
    path: "/admin/security/unban-ip",
    description: "Unban an IP address",
    permission: "admin",
    params: [
      { name: "ip", type: "string", required: true, description: "IP address to unban" },
    ],
  },
  {
    method: "POST",
    path: "/admin/airlink-cloud",
    description: "Update Airlink Cloud settings",
    permission: "admin",
    params: [
      { name: "apiKey", type: "string", required: false, description: "Cloud API key" },
      { name: "backupEnabled", type: "boolean", required: false, description: "Enable cloud backups" },
    ],
  },
  {
    method: "GET",
    path: "/consumer/overview",
    description: "Get consumer server list",
    permission: "user",
  },
  {
    method: "GET",
    path: "/api/consumer/v1/servers",
    description: "List servers via consumer API",
    permission: "user",
  },
  {
    method: "POST",
    path: "/api/consumer/v1/servers/:uuid/power",
    description: "Control server power state",
    permission: "user",
    params: [
      { name: "action", type: "string", required: true, description: "start, stop, restart, kill" },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  POST: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400",
  PUT: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400",
  DELETE: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400",
  PATCH: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400",
};

export function AdminApiDocsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { status: number; body: string; time: number }>
  >({});
  const [testLoading, setTestLoading] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<
    Record<string, Record<string, string>>
  >({});

  const isAdmin = user?.isAdmin;

  const filteredEndpoints = endpoints.filter((ep) => {
    if (ep.permission === "admin") return isAdmin;
    return true;
  });

  const toggleExpand = (key: string) => {
    setExpanded(expanded === key ? null : key);
  };

  const setParam = (
    endpointKey: string,
    paramName: string,
    value: string
  ) => {
    setParamValues((prev) => ({
      ...prev,
      [endpointKey]: {
        ...(prev[endpointKey] || {}),
        [paramName]: value,
      },
    }));
  };

  const testEndpoint = async (ep: Endpoint) => {
    const key = `${ep.method} ${ep.path}`;
    setTestLoading(key);
    const start = performance.now();

    try {
      let url = ep.path;
      const params = paramValues[key] || {};

      // Replace path params
      ep.params
        ?.filter((p) => url.includes(`:${p.name}`))
        .forEach((p) => {
          url = url.replace(`:${p.name}`, params[p.name] || "");
        });

      const options: RequestInit = {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      };

      if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
        options.method = ep.method;
        const bodyParams = ep.params?.filter(
          (p) => !ep.path.includes(`:${p.name}`)
        );
        if (bodyParams && bodyParams.length > 0) {
          const body: Record<string, unknown> = {};
          bodyParams.forEach((p) => {
            if (params[p.name] !== undefined) {
              body[p.name] =
                p.type === "boolean"
                  ? params[p.name] === "true"
                  : p.type === "number"
                    ? Number(params[p.name])
                    : params[p.name];
            }
          });
          options.body = JSON.stringify(body);
        }
      }

      const res = await fetch(url, options);
      const time = Math.round(performance.now() - start);
      const body = await res.text();

      setTestResults((prev) => ({
        ...prev,
        [key]: { status: res.status, body, time },
      }));
    } catch (err) {
      const time = Math.round(performance.now() - start);
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: 0,
          body: err instanceof Error ? err.message : "Request failed",
          time,
        },
      }));
    } finally {
      setTestLoading(null);
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
          API Documentation
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Reference and live-test available API endpoints
        </p>
      </div>

      {!isAdmin && (
        <Card className="border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Lock className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Some endpoints require admin permissions. You're
              viewing user-accessible endpoints only.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filteredEndpoints.map((ep) => {
          const key = `${ep.method} ${ep.path}`;
          const isExpanded = expanded === key;
          const result = testResults[key];
          const params = ep.params || [];

          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card
                className={cn(
                  "transition-colors",
                  isExpanded &&
                    "border-neutral-300 dark:border-white/15"
                )}
              >
                <button
                  onClick={() => toggleExpand(key)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-lg text-xs font-mono font-bold shrink-0",
                      methodColors[ep.method]
                    )}
                  >
                    {ep.method}
                  </span>
                  <code className="text-sm text-neutral-900 dark:text-white font-mono flex-1 truncate">
                    {ep.path}
                  </code>
                  <Badge variant="neutral" className="hidden sm:inline-flex">
                    {ep.permission}
                  </Badge>
                  {isExpanded ? (
                    <CaretDown className="size-4 text-neutral-400 shrink-0" />
                  ) : (
                    <CaretRight className="size-4 text-neutral-400 shrink-0" />
                  )}
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-neutral-200/30 dark:border-white/[0.07] pt-4">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          {ep.description}
                        </p>

                        {params.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                              Parameters
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {params.map((p) => (
                                <div
                                  key={p.name}
                                  className="space-y-1"
                                >
                                  <Label className="text-xs">
                                    {p.name}
                                    {p.required && (
                                      <span className="text-red-500 ml-1">
                                        *
                                      </span>
                                    )}
                                    <span className="text-neutral-400 dark:text-neutral-500 ml-1.5 font-normal">
                                      {p.type}
                                    </span>
                                  </Label>
                                  <Input
                                    placeholder={
                                      p.description
                                    }
                                    value={
                                      paramValues[key]?.[
                                        p.name
                                      ] || ""
                                    }
                                    onChange={(e) =>
                                      setParam(
                                        key,
                                        p.name,
                                        e.target.value
                                      )
                                    }
                                    className="h-9 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => testEndpoint(ep)}
                            loading={testLoading === key}
                          >
                            <ArrowRight className="size-3.5" />
                            Test
                          </Button>
                          {result && (
                            <div className="flex items-center gap-2 text-xs">
                              <Badge
                                variant={
                                  result.status >= 200 &&
                                  result.status < 300
                                    ? "success"
                                    : result.status === 0
                                      ? "danger"
                                      : "warning"
                                }
                              >
                                {result.status || "ERR"}
                              </Badge>
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {result.time}ms
                              </span>
                            </div>
                          )}
                        </div>

                        {result && (
                          <div className="rounded-xl bg-neutral-950 dark:bg-black/40 p-4 max-h-64 overflow-auto">
                            <pre className="text-xs text-neutral-300 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all">
                              {result.body}
                            </pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
