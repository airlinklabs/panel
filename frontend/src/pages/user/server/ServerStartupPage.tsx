import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { FloppyDisk, Loader2 } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";

interface Variable {
  name: string;
  env_variable: string;
  type: string;
  default_value: string;
  value: string;
}

export function ServerStartupPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startCommand, setStartCommand] = useState("");

  const fetchStartup = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        const server = data.server;
        if (server?.Variables) {
          try {
            const parsed = JSON.parse(server.Variables);
            setVariables(parsed);
          } catch {
            setVariables([]);
          }
        }
        setStartCommand(server?.StartCommand || "");
      }
    } catch {
      toast("Failed to load startup data", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchStartup();
  }, [fetchStartup]);

  const handleVariableChange = (index: number, value: string) => {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, value } : v))
    );
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/server/${id}/startup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, startCommand }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to save");
      toast("Startup settings saved", "success");
    } catch {
      toast("Failed to save startup settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
                <div className="h-10 bg-neutral-200 dark:bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Startup
          </h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}
            Save
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Start Command
            </h2>
            <input
              type="text"
              value={startCommand}
              onChange={(e) => setStartCommand(e.target.value)}
              className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors font-mono"
            />
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Variables
            </h2>
            {variables.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 py-4 text-center">
                No variables configured
              </p>
            ) : (
              <div className="space-y-4">
                {variables.map((variable, index) => (
                  <div key={variable.env_variable || index}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-neutral-900 dark:text-white">
                        {variable.name || variable.env_variable}
                      </label>
                      {variable.env_variable && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
                          {variable.env_variable}
                        </span>
                      )}
                    </div>
                    {variable.type === "boolean" ? (
                      <select
                        value={variable.value ?? variable.default_value ?? ""}
                        onChange={(e) => handleVariableChange(index, e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors appearance-none"
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : variable.type === "number" ? (
                      <input
                        type="number"
                        value={variable.value ?? variable.default_value ?? ""}
                        onChange={(e) => handleVariableChange(index, e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                      />
                    ) : (
                      <input
                        type="text"
                        value={variable.value ?? variable.default_value ?? ""}
                        onChange={(e) => handleVariableChange(index, e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
