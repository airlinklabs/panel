import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Plus, Trash, Pencil, ToggleRight, ToggleLeft } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export function ServerTasksPage() {
  const { id } = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formCommand, setFormCommand] = useState("");

  useEffect(() => {
    api
      .get<{ data: ScheduledTask[] }>(`/server/${id}/tasks`)
      .then((res) => setTasks(res.data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAdd = async () => {
    if (!formName.trim() || !formCron.trim() || !formCommand.trim()) return;
    setAdding(true);
    try {
      await api.post(`/server/${id}/tasks`, {
        name: formName.trim(),
        cron: formCron.trim(),
        command: formCommand.trim(),
      });
      const res = await api.get<{ data: ScheduledTask[] }>(`/server/${id}/tasks`);
      setTasks(res.data || []);
      setShowForm(false);
      setFormName("");
      setFormCron("");
      setFormCommand("");
    } catch {
      /* toast */
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (taskId: string, enabled: boolean) => {
    try {
      await api.patch(`/server/${id}/tasks/${taskId}`, { enabled });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, enabled } : t))
      );
    } catch {
      /* toast */
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Delete this scheduled task?")) return;
    try {
      await api.delete(`/server/${id}/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      /* toast */
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">
            Scheduled Tasks
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Automate server commands on a schedule
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4 mr-2" />
          New Task
        </Button>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <Card className="p-4 space-y-3">
            <Input
              placeholder="Task name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <Input
              placeholder="Cron expression (e.g. 0 * * * *)"
              value={formCron}
              onChange={(e) => setFormCron(e.target.value)}
            />
            <Input
              placeholder="Command to run"
              value={formCommand}
              onChange={(e) => setFormCommand(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} loading={adding}>
                Create
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Clock className="size-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            No scheduled tasks
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Create tasks to automate server maintenance
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Clock className="size-4 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                      {task.name}
                    </p>
                    <p className="text-xs text-neutral-400 font-mono truncate">
                      {task.cron} &middot; {task.command}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={task.enabled ? "success" : "neutral"} className="text-[10px]">
                    {task.enabled ? "Active" : "Disabled"}
                  </Badge>
                  <Switch
                    checked={task.enabled}
                    onCheckedChange={(checked) =>
                      handleToggle(task.id, checked)
                    }
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(task.id)}
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
