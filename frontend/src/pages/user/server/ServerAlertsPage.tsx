import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, Plus, Trash, ToggleRight, ToggleLeft } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface Alert {
  id: string;
  type: "cpu" | "ram" | "disk";
  threshold: number;
  enabled: boolean;
  webhook?: string;
}

const alertTypes = [
  { value: "cpu", label: "CPU Usage" },
  { value: "ram", label: "RAM Usage" },
  { value: "disk", label: "Disk Usage" },
];

export function ServerAlertsPage() {
  const { id } = useParams<{ id: string }>();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("cpu");
  const [newThreshold, setNewThreshold] = useState("80");

  useEffect(() => {
    api
      .get<{ data: Alert[] }>(`/server/${id}/alerts`)
      .then((res) => setAlerts(res.data || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await api.post(`/server/${id}/alerts`, {
        type: newType,
        threshold: parseInt(newThreshold),
      });
      const res = await api.get<{ data: Alert[] }>(`/server/${id}/alerts`);
      setAlerts(res.data || []);
    } catch {
      /* toast */
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (alertId: string, enabled: boolean) => {
    try {
      await api.patch(`/server/${id}/alerts/${alertId}`, { enabled });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, enabled } : a))
      );
    } catch {
      /* toast */
    }
  };

  const handleDelete = async (alertId: string) => {
    if (!confirm("Delete this alert?")) return;
    try {
      await api.delete(`/server/${id}/alerts/${alertId}`);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      /* toast */
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">
          Alerts
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Configure server resource alerts
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={newType} onValueChange={setNewType}>
            {alertTypes.map((t) => (
              <Select.Option key={t.value} value={t.value}>
                {t.label}
              </Select.Option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-neutral-500">%</span>
            <Button onClick={handleAdd} loading={adding}>
              <Plus className="size-4 mr-2" />
              Add
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Bell className="size-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            No alerts configured
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Add alerts to get notified when resources exceed thresholds
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <Bell className="size-4 text-neutral-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-white capitalize">
                      {alert.type} Usage
                    </p>
                    <p className="text-xs text-neutral-400">
                      Threshold: {alert.threshold}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={alert.enabled}
                    onCheckedChange={(checked) =>
                      handleToggle(alert.id, checked)
                    }
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(alert.id)}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
