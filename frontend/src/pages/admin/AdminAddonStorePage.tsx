import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Storefront,
  MagnifyingGlass,
  Download,
  Trash,
  X,
  Star,
  Package,
  CheckCircle,
  Info,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal";

interface AddonStoreItem {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  installed: boolean;
  downloads: number;
  rating?: number;
}

interface InstallLog {
  line: string;
  type: "info" | "success" | "error";
}

export function AdminAddonStorePage() {
  const { toast } = useToast();
  const [addons, setAddons] = useState<AddonStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [installLogs, setInstallLogs] = useState<InstallLog[]>([]);
  const [selectedAddon, setSelectedAddon] =
    useState<AddonStoreItem | null>(null);
  const [detailTab, setDetailTab] = useState("overview");

  const fetchStore = async () => {
    try {
      const res = await api.get<{ data: AddonStoreItem[] }>(
        "/admin/addons/store/list"
      );
      setAddons(res.data);
    } catch {
      toast("Failed to load addon store", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStore();
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    addons.forEach((a) => a.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [addons]);

  const filtered = useMemo(() => {
    let result = addons;
    if (activeTag) {
      result = result.filter((a) => a.tags?.includes(activeTag));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q)
      );
    }
    return result;
  }, [addons, search, activeTag]);

  const handleInstall = async (slug: string) => {
    setInstalling(slug);
    setInstallLogs([{ line: `Installing ${slug}...`, type: "info" }]);
    try {
      await api.post("/admin/addons/store/install", { slug });
      setInstallLogs((prev) => [
        ...prev,
        { line: "Installation complete", type: "success" },
      ]);
      setAddons((prev) =>
        prev.map((a) =>
          a.slug === slug ? { ...a, installed: true } : a
        )
      );
      toast("Addon installed successfully", "success");
    } catch {
      setInstallLogs((prev) => [
        ...prev,
        { line: "Installation failed", type: "error" },
      ]);
      toast("Failed to install addon", "error");
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (slug: string) => {
    setUninstalling(slug);
    try {
      await api.post("/admin/addons/store/uninstall", { slug });
      setAddons((prev) =>
        prev.map((a) =>
          a.slug === slug ? { ...a, installed: false } : a
        )
      );
      toast("Addon uninstalled", "success");
    } catch {
      toast("Failed to uninstall addon", "error");
    } finally {
      setUninstalling(null);
    }
  };

  const openDetail = (addon: AddonStoreItem) => {
    setSelectedAddon(addon);
    setDetailTab("overview");
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
          Addon Store
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Browse and install addons to extend panel functionality
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <Input
            placeholder="Search addons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              !activeTag
                ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10"
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                activeTag === tag
                  ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Storefront className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
              {search || activeTag
                ? "No addons match your filters"
                : "No addons available in the store"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((addon, i) => (
              <motion.div
                key={addon.slug}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Card
                  className="h-full flex flex-col cursor-pointer hover:border-neutral-300 dark:hover:border-white/15 transition-colors"
                  onClick={() => openDetail(addon)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="size-10 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                        <Package className="size-5 text-neutral-500 dark:text-neutral-400" />
                      </div>
                      {addon.installed && (
                        <Badge variant="success">Installed</Badge>
                      )}
                    </div>
                    <CardTitle className="text-base mt-3">
                      {addon.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs">
                      {addon.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>{addon.author}</span>
                        {addon.rating != null && (
                          <span className="flex items-center gap-1">
                            <Star className="size-3 fill-current" />
                            {addon.rating}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {addon.installed ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleUninstall(addon.slug)}
                            loading={uninstalling === addon.slug}
                          >
                            <Trash className="size-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInstall(addon.slug)}
                            loading={installing === addon.slug}
                          >
                            <Download className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={!!selectedAddon}
        onOpenChange={(open) => !open && setSelectedAddon(null)}
      >
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>{selectedAddon?.name}</ModalTitle>
            <ModalDescription>
              {selectedAddon?.author} · v{selectedAddon?.version}
            </ModalDescription>
          </ModalHeader>

          <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                Overview
              </TabsTrigger>
              <TabsTrigger value="installation" className="flex-1">
                Installation
              </TabsTrigger>
              <TabsTrigger value="reviews" className="flex-1">
                Reviews
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {selectedAddon?.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedAddon?.tags?.map((tag) => (
                  <Badge key={tag} variant="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-neutral-50 dark:bg-white/[0.03] p-3">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                    v{selectedAddon?.version}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Version
                  </p>
                </div>
                <div className="rounded-lg bg-neutral-50 dark:bg-white/[0.03] p-3">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {selectedAddon?.downloads ?? 0}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Downloads
                  </p>
                </div>
                <div className="rounded-lg bg-neutral-50 dark:bg-white/[0.03] p-3">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {selectedAddon?.rating ?? "—"}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Rating
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="installation" className="mt-4 space-y-4">
              {installLogs.length > 0 ? (
                <div className="rounded-xl bg-neutral-950 dark:bg-black/40 p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
                  {installLogs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2",
                        log.type === "success" &&
                          "text-emerald-400",
                        log.type === "error" && "text-red-400",
                        log.type === "info" &&
                          "text-neutral-400"
                      )}
                    >
                      {log.type === "success" && (
                        <CheckCircle className="size-3.5 mt-0.5 shrink-0" />
                      )}
                      {log.type === "error" && (
                        <WarningCircle className="size-3.5 mt-0.5 shrink-0" />
                      )}
                      {log.type === "info" && (
                        <Info className="size-3.5 mt-0.5 shrink-0" />
                      )}
                      <span>{log.line}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-6">
                  Click install to see output here
                </p>
              )}
              <div className="flex gap-2">
                {selectedAddon?.installed ? (
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={() =>
                      selectedAddon &&
                      handleUninstall(selectedAddon.slug)
                    }
                    loading={uninstalling === selectedAddon?.slug}
                  >
                    <Trash className="size-4" />
                    Uninstall
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={() =>
                      selectedAddon &&
                      handleInstall(selectedAddon.slug)
                    }
                    loading={installing === selectedAddon?.slug}
                  >
                    <Download className="size-4" />
                    Install
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="mt-4">
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-6">
                Reviews coming soon
              </p>
            </TabsContent>
          </Tabs>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
