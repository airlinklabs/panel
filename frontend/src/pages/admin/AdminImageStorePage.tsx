import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MagnifyingGlass,
  Download,
  Package,
  FolderOpen,
  Spinner,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/context/ToastContext";

interface CatalogueEgg {
  id: number;
  name: string;
  description: string;
  dockerImage: string;
  category: string;
  readme?: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

const categories = [
  "All",
  "Minecraft",
  "Source Engine",
  "Voice Servers",
  "Web Servers",
  "Databases",
  "Other",
];

export function AdminImageStorePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [eggs, setEggs] = useState<CatalogueEgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedEgg, setSelectedEgg] = useState<CatalogueEgg | null>(null);
  const [installing, setInstalling] = useState(false);

  const fetchCatalogue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CatalogueEgg[] }>("/admin/images/store/catalogue");
      setEggs(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  const handleInstall = async (egg: CatalogueEgg) => {
    setInstalling(true);
    try {
      await api.post("/admin/images/store/install", { id: egg.id });
      toast(`${egg.name} installed successfully`);
      setSelectedEgg(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to install", "error");
    } finally {
      setInstalling(false);
    }
  };

  const filtered = eggs.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || e.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/images")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Image Store</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Browse and install egg templates</p>
        </div>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          placeholder="Search eggs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
              category === cat
                ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FolderOpen className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">
            {search || category !== "All" ? "No eggs match your filters" : "No eggs in store"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((egg) => (
            <motion.div key={egg.id} variants={fadeUp}>
              <Card
                className="h-full hover:border-neutral-300 dark:hover:border-white/15 transition-colors cursor-pointer"
                onClick={() => setSelectedEgg(egg)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                        <Package className="size-5 text-neutral-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white">{egg.name}</h3>
                        <p className="text-xs text-neutral-400 truncate max-w-[200px]">{egg.dockerImage}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-3">
                    {egg.description || "No description"}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="neutral">{egg.category || "Uncategorized"}</Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(egg);
                      }}
                      loading={installing}
                    >
                      <Download className="size-3" />
                      Install
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {selectedEgg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedEgg(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                    <Package className="size-5 text-neutral-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{selectedEgg.name}</h2>
                    <p className="text-xs text-neutral-400">{selectedEgg.dockerImage}</p>
                  </div>
                </div>
                <Badge variant="neutral">{selectedEgg.category}</Badge>
              </div>

              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                {selectedEgg.description || "No description available."}
              </p>

              {selectedEgg.readme && (
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/30 dark:border-white/[0.07] mb-4">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Readme</p>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-mono">
                    {selectedEgg.readme}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setSelectedEgg(null)}>
                  Close
                </Button>
                <Button onClick={() => handleInstall(selectedEgg)} loading={installing}>
                  <Download className="size-4" />
                  Install Egg
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
