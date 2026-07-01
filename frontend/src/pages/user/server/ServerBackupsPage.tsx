import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Archive,
  ArrowClockwise,
  Trash,
  Download,
  Plus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Backup {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  status: "completed" | "pending" | "failed";
}

export function ServerBackupsPage() {
  const { id } = useParams<{ id: string }>();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Backup[] }>(`/server/${id}/backups`)
      .then((res) => setBackups(res.data || []))
      .catch(() => setBackups([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.post(`/server/${id}/backups`);
      const res = await api.get<{ data: Backup[] }>(`/server/${id}/backups`);
      setBackups(res.data || []);
    } catch {
      /* toast */
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!confirm("Restore this backup? Current data will be overwritten."))
      return;
    try {
      await api.post(`/server/${id}/backups/${backupId}/restore`);
    } catch {
      /* toast */
    }
  };

  const handleDelete = async (backupId: string) => {
    if (!confirm("Delete this backup?")) return;
    try {
      await api.delete(`/server/${id}/backups/${backupId}`);
      setBackups((prev) => prev.filter((b) => b.id !== backupId));
    } catch {
      /* toast */
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const statusColor = {
    completed: "success" as const,
    pending: "warning" as const,
    failed: "danger" as const,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">
            Backups
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Create and manage server backups
          </p>
        </div>
        <Button onClick={handleCreate} loading={creating}>
          <Plus className="size-4 mr-2" />
          Create Backup
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : backups.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Archive className="size-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            No backups yet
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Create a backup to protect your server data
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {backups.map((backup, i) => (
            <motion.div
              key={backup.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Archive className="size-4 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                      {backup.name}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {formatSize(backup.size)} &middot;{" "}
                      {new Date(backup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColor[backup.status]} className="text-[10px]">
                    {backup.status}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(backup.id)}
                  >
                    <ArrowClockwise className="size-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/server/${id}/backups/${backup.id}/download`
                      )
                    }
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(backup.id)}
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
