import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Link, Plus, Trash, Clipboard, Eye, EyeSlash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AccessEntry {
  id: string;
  email: string;
  username: string;
  permissions: string[];
  createdAt: string;
}

export function ServerAccessPage() {
  const { id } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [showLink, setShowLink] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: AccessEntry[] }>(`/server/${id}/access`)
      .then((res) => setEntries(res.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setAdding(true);
    try {
      await api.post(`/server/${id}/access`, { email: email.trim() });
      setEmail("");
      const res = await api.get<{ data: AccessEntry[] }>(`/server/${id}/access`);
      setEntries(res.data || []);
    } catch {
      /* toast */
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (entryId: string) => {
    if (!confirm("Remove access for this user?")) return;
    try {
      await api.delete(`/server/${id}/access/${entryId}`);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch {
      /* toast */
    }
  };

  const copyLink = (entryId: string) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/server/${id}/access/${entryId}`
    );
    setShowLink(entryId);
    setTimeout(() => setShowLink(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">
          DesktopTower Access
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Share server access with other users
        </p>
      </div>

      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} loading={adding}>
            <Plus className="size-4 mr-2" />
            Add
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Link className="size-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            No shared access
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Add users by email to share server access
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-neutral-500">
                      {entry.username?.charAt(0).toUpperCase() || "?"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                      {entry.username}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">
                      {entry.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {entry.permissions.map((p) => (
                    <Badge key={p} variant="neutral" className="text-[10px]">
                      {p}
                    </Badge>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyLink(entry.id)}
                  >
                    {showLink === entry.id ? (
                      <Clipboard className="size-3.5 text-emerald-500" />
                    ) : (
                      <Clipboard className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemove(entry.id)}
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
