import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MagnifyingGlass,
  Plus,
  Trash,
  PencilSimple,
  Image,
  Upload,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import { useToast } from "@/context/ToastContext";

interface EggData {
  id: number;
  name: string;
  dockerImage: string;
  features: string[];
  startup?: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminImagesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [eggs, setEggs] = useState<EggData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EggData | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEggs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: EggData[] }>("/admin/images/list");
      setEggs(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEggs();
  }, [fetchEggs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/images/${deleteTarget.id}`);
      setEggs((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Image deleted");
    } catch {
      toast("Failed to delete image", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      const parsed = JSON.parse(jsonInput);
      await api.post("/admin/images/create", parsed);
      toast("Image created");
      setShowUpload(false);
      setJsonInput("");
      fetchEggs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Invalid JSON", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonInput(ev.target?.result as string);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = eggs.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.dockerImage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Images</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {eggs.length} {eggs.length === 1 ? "image" : "images"} configured
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="size-4" />
          Create Image
        </Button>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input placeholder="Search images..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-neutral-50 dark:bg-white/[0.02]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Image className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                {search ? "No images match your search" : "No images found"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/30 dark:border-white/[0.07]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">Docker Image</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Features</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
                  {filtered.map((egg) => (
                    <tr
                      key={egg.id}
                      className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/images/edit/${egg.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">{egg.name}</td>
                      <td className="px-4 py-3 text-neutral-500 font-mono text-xs hidden md:table-cell">{egg.dockerImage}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(egg.features || []).slice(0, 3).map((f) => (
                            <Badge key={f} variant="neutral" className="text-[10px]">{f}</Badge>
                          ))}
                          {(egg.features || []).length > 3 && (
                            <Badge variant="neutral" className="text-[10px]">+{egg.features.length - 3}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/images/edit/${egg.id}`)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                          >
                            <PencilSimple className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(egg)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle className="text-center">Delete Image</ModalTitle>
            <ModalDescription className="text-center">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={deleting}>Cancel</Button>
            </ModalClose>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash className="size-4" />
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={showUpload} onOpenChange={(open) => !open && setShowUpload(false)}>
        <ModalContent className="max-w-xl">
          <ModalHeader>
            <ModalTitle>Create Image</ModalTitle>
            <ModalDescription>Paste a JSON egg definition or upload a file.</ModalDescription>
          </ModalHeader>
          <div className="space-y-4 py-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                Upload JSON File
              </Button>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"name": "Minecraft", "dockerImage": "...", ...}'
              className={cn(
                "w-full h-64 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-mono",
                "text-neutral-900 dark:text-white placeholder:text-neutral-400",
                "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 resize-none"
              )}
            />
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={uploading}>Cancel</Button>
            </ModalClose>
            <Button onClick={handleUpload} loading={uploading} disabled={!jsonInput.trim()}>
              <Plus className="size-4" />
              Create
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
