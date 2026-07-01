import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Gear, Warning, Loader2, Trash, ArrowRight } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";
import { useNavigate } from "react-router-dom";

export function ServerSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [server, setServer] = useState<{ name: string; description: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);

  const fetchServer = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setServer(data.server);
        setName(data.server?.name || "");
        setDescription(data.server?.description || "");
      }
    } catch {
      toast("Failed to load server", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/server/${id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to save");
      toast("Settings saved", "success");
      setServer((prev) => (prev ? { ...prev, name, description } : prev));
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReinstall = async () => {
    if (!id) return;
    setReinstalling(true);
    try {
      const res = await fetch(`/server/${id}/reinstall`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to reinstall");
      toast("Server reinstall started", "success");
    } catch {
      toast("Failed to reinstall server", "error");
    } finally {
      setReinstalling(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/user/server/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast("Server deleted", "success");
      navigate("/");
    } catch {
      toast("Failed to delete server", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
                <div className="h-10 bg-neutral-200 dark:bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-6">
          Server Settings
        </h1>

        <div className="space-y-6">
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              General
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                  Server name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-4"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Gear className="size-4" />}
                  Save changes
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Reinstall Server
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Reinstall the server. This will re-run the installation scripts without deleting your files.
            </p>
            <button
              onClick={handleReinstall}
              disabled={reinstalling}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-4"
            >
              {reinstalling ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Reinstall
            </button>
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-red-200/50 dark:border-red-500/20 rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
              <Warning className="size-5" />
              Danger Zone
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Permanently delete this server and all its data. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDelete(true)}
              className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-red-600 text-white hover:bg-red-700 text-sm gap-1.5 px-4"
            >
              <Trash className="size-4" />
              Delete server
            </button>
          </div>
        </div>
      </motion.div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <h3 className="font-display text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              Delete Server
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Are you sure you want to delete <strong>{server?.name}</strong>? This will permanently remove all files and data.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 text-sm px-4"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 inline-flex items-center justify-center font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-4"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash className="size-4" />}
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
