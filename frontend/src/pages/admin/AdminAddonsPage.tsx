import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PuzzlePiece,
  MagnifyingGlass,
  ArrowClockwise,
  Trash,
  ToggleLeft,
  ToggleRight,
  Package,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface Addon {
  name: string;
  slug: string;
  version: string;
  enabled: boolean;
  description?: string;
}

export function AdminAddonsPage() {
  const { toast } = useToast();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const fetchAddons = async () => {
    try {
      const res = await api.get<{ data: Addon[] }>("/admin/addons");
      setAddons(res.data);
    } catch {
      toast("Failed to load addons", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return addons;
    const q = search.toLowerCase();
    return addons.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q)
    );
  }, [addons, search]);

  const handleToggle = async (slug: string) => {
    setToggling(slug);
    try {
      await api.post(`/admin/addons/toggle/${slug}`);
      setAddons((prev) =>
        prev.map((a) =>
          a.slug === slug ? { ...a, enabled: !a.enabled } : a
        )
      );
      const addon = addons.find((a) => a.slug === slug);
      toast(
        `${addon?.name ?? slug} ${addon?.enabled ? "disabled" : "enabled"}`,
        "success"
      );
    } catch {
      toast("Failed to toggle addon", "error");
    } finally {
      setToggling(null);
    }
  };

  const handleUninstall = async (slug: string) => {
    setUninstalling(slug);
    try {
      await api.post("/admin/addons/store/uninstall", { slug });
      setAddons((prev) => prev.filter((a) => a.slug !== slug));
      toast("Addon uninstalled", "success");
    } catch {
      toast("Failed to uninstall addon", "error");
    } finally {
      setUninstalling(null);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await api.post("/admin/addons/reload");
      await fetchAddons();
      toast("Addons reloaded", "success");
    } catch {
      toast("Failed to reload addons", "error");
    } finally {
      setReloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
            Addons
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Manage installed addons and their configurations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <Input
              placeholder="Search addons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReload}
            loading={reloading}
          >
            <ArrowClockwise className="size-4" />
            Reload
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <div className="size-8 border-2 border-neutral-200 dark:border-white/10 border-t-neutral-900 dark:border-t-white rounded-full animate-spin mx-auto" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
                Loading addons...
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <PuzzlePiece className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
                {search ? "No addons match your search" : "No addons installed"}
              </p>
              {!search && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                  Visit the{" "}
                  <a
                    href="/admin/addons/store"
                    className="underline hover:text-neutral-900 dark:hover:text-white"
                  >
                    addon store
                  </a>{" "}
                  to browse and install addons
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Slug
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Version
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filtered.map((addon) => (
                    <motion.tr
                      key={addon.slug}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-neutral-200/30 dark:border-white/[0.07] hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                            <Package className="size-4 text-neutral-500 dark:text-neutral-400" />
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-white text-sm">
                              {addon.name}
                            </p>
                            {addon.description && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                                {addon.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <code className="text-xs bg-neutral-100 dark:bg-white/5 px-2 py-1 rounded-lg text-neutral-600 dark:text-neutral-300">
                          {addon.slug}
                        </code>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          v{addon.version}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={addon.enabled ? "success" : "neutral"}
                        >
                          {addon.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggle(addon.slug)}
                            disabled={toggling === addon.slug}
                          >
                            {addon.enabled ? (
                              <ToggleRight className="size-4" />
                            ) : (
                              <ToggleLeft className="size-4" />
                            )}
                            <span className="hidden sm:inline">
                              {addon.enabled ? "Disable" : "Enable"}
                            </span>
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleUninstall(addon.slug)}
                            loading={uninstalling === addon.slug}
                          >
                            <Trash className="size-4" />
                            <span className="hidden sm:inline">
                              Uninstall
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
