import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GlobeHemisphereWest,
  Upload,
  Download,
  Trash,
  FolderOpen,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface World {
  name: string;
  size: number;
  lastModified: string;
  default: boolean;
}

export function ServerWorldsPage() {
  const { id } = useParams<{ id: string }>();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .get<{ data: World[] }>(`/server/${id}/worlds`)
      .then((res) => setWorlds(res.data || []))
      .catch(() => setWorlds([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.upload(`/server/${id}/worlds`, form);
      const res = await api.get<{ data: World[] }>(`/server/${id}/worlds`);
      setWorlds(res.data || []);
    } catch {
      /* toast handled by api */
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete world "${name}"?`)) return;
    try {
      await api.delete(`/server/${id}/worlds/${encodeURIComponent(name)}`);
      setWorlds((prev) => prev.filter((w) => w.name !== name));
    } catch {
      /* toast */
    }
  };

  const handleDownload = (name: string) => {
    window.open(`/server/${id}/worlds/${encodeURIComponent(name)}/download`);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">
            Worlds
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Manage Minecraft world files
          </p>
        </div>
        <label>
          <input
            type="file"
            className="hidden"
            accept=".zip,.tar.gz,.rar"
            onChange={handleUpload}
          />
          <Button asChild loading={uploading}>
            <span>
              <Upload className="size-4 mr-2" />
              Upload World
            </span>
          </Button>
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : worlds.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <GlobeHemisphereWest className="size-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            No worlds found
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Upload a world file to get started
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {worlds.map((world, i) => (
            <motion.div
              key={world.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <GlobeHemisphereWest className="size-4 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                      {world.name}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {formatSize(world.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {world.default && (
                    <Badge variant="success" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(world.name)}
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(world.name)}
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
