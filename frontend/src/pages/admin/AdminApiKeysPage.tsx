import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key,
  Plus,
  Trash,
  Copy,
  Eye,
  EyeSlash,
  Shield,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
}

export function AdminApiKeysPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState("admin");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    new Set()
  );

  const fetchKeys = async () => {
    try {
      const res = await api.get<{ data: ApiKey[] }>(
        "/api/admin/api-keys"
      );
      setKeys(res.data);
    } catch {
      toast("Failed to load API keys", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast("Name is required", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<{ data: ApiKey }>(
        "/api/admin/api-keys",
        { name: newName, permissions: newPerms.split(",").map((s) => s.trim()) }
      );
      setCreatedKey(res.data.key);
      setKeys((prev) => [...prev, res.data]);
      setNewName("");
      setNewPerms("admin");
      toast("API key created", "success");
    } catch {
      toast("Failed to create API key", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/api-keys/${deleteId}`);
      setKeys((prev) => prev.filter((k) => k.id !== deleteId));
      toast("API key deleted", "success");
    } catch {
      toast("Failed to delete API key", "error");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast("Key copied to clipboard", "success");
  };

  const toggleVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) =>
    key.slice(0, 8) + "••••••••" + key.slice(-4);

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
            API Keys
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Manage admin API keys for programmatic access
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create Key
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <div className="size-8 border-2 border-neutral-200 dark:border-white/10 border-t-neutral-900 dark:border-t-white rounded-full animate-spin mx-auto" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
                Loading API keys...
              </p>
            </div>
          ) : keys.length === 0 ? (
            <div className="p-12 text-center">
              <Key className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
                No API keys created yet
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-4" />
                Create your first key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Permissions
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Created
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {keys.map((k) => (
                    <motion.tr
                      key={k.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-neutral-200/30 dark:border-white/[0.07] hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className="size-4 text-neutral-400" />
                          <span className="font-medium text-sm">
                            {k.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-neutral-100 dark:bg-white/5 px-2 py-1 rounded-lg text-neutral-600 dark:text-neutral-300 font-mono">
                            {visibleKeys.has(k.id)
                              ? k.key
                              : maskKey(k.key)}
                          </code>
                          <button
                            onClick={() => toggleVisible(k.id)}
                            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                          >
                            {visibleKeys.has(k.id) ? (
                              <EyeSlash className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => copyKey(k.key)}
                            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {k.permissions.map((p) => (
                            <Badge
                              key={p}
                              variant="neutral"
                              className="text-[10px]"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {new Date(
                            k.createdAt
                          ).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteId(k.id)}
                          >
                            <Trash className="size-4" />
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

      <Modal open={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Create API Key</ModalTitle>
            <ModalDescription>
              Generate a new key for programmatic access
            </ModalDescription>
          </ModalHeader>

          {createdKey ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-4">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Key created successfully
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Copy this key now. It won't be shown again.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-neutral-100 dark:bg-white/5 rounded-xl p-3">
                <code className="text-xs font-mono text-neutral-900 dark:text-white flex-1 break-all">
                  {createdKey}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyKey(createdKey)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <ModalFooter>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreatedKey(null);
                    setCreateOpen(false);
                  }}
                >
                  Done
                </Button>
              </ModalFooter>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. CI Pipeline"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-perms">
                  Permissions (comma-separated)
                </Label>
                <Input
                  id="key-perms"
                  placeholder="admin, servers, nodes"
                  value={newPerms}
                  onChange={(e) => setNewPerms(e.target.value)}
                />
              </div>
              <ModalFooter>
                <Button
                  variant="secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  loading={creating}
                >
                  Create
                </Button>
              </ModalFooter>
            </div>
          )}
        </ModalContent>
      </Modal>

      <Modal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete API Key</ModalTitle>
            <ModalDescription>
              This action cannot be undone. Any applications using
              this key will stop working.
            </ModalDescription>
          </ModalHeader>
          <div className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-500/10 p-4 mt-4">
            <WarningCircle className="size-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">
              Are you sure you want to permanently delete this key?
            </p>
          </div>
          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleting}
            >
              Delete Key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
