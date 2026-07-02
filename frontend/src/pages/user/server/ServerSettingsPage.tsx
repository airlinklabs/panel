import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "@/context/ToastContext";
import { useNavigate } from "react-router-dom";
import { csrfFetch } from "@/lib/csrf";

interface ServerData {
  id: number;
  name: string;
  description: string | null;
  Memory: number;
  Cpu: number;
  Storage: number;
  UUID: string;
  Suspended: boolean;
  createdAt: string;
  node: { name: string } | null;
  image: { name: string } | null;
}

export function ServerSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [server, setServer] = useState<ServerData | null>(null);
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
      const res = await csrfFetch(`/server/${id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast("Settings saved successfully.", "success");
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
      const res = await csrfFetch(`/server/${id}/reinstall`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reinstall");
      toast("Server reinstalling. This may take a while.", "success");
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
      const res = await csrfFetch(`/user/server/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast("Server deleted.", "success");
      navigate("/");
    } catch {
      toast("Failed to delete server", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
          <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-5 space-y-4">
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

  const formatStorage = (mb: number) => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  };

  return (
    <div className="p-6">
      <div className="space-y-6">
        {/* Settings form */}
        <div className="data-animate-card rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-5">
          <h2 className="text-lg font-semibold mb-4 text-neutral-800 dark:text-white">Server Settings</h2>
          <form
            id="serverSettingsForm"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Server Name</label>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Server Description</label>
                <textarea
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 transition"
                />
              </div>
            </div>
            <div className="mt-6">
              <button
                type="submit"
                disabled={saving}
                className="bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 transition"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Server Information */}
        <div className="data-animate-card rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 p-5">
          <h2 className="text-lg font-semibold mb-4 text-neutral-800 dark:text-white">Server Information</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Node</dt>
              <dd className="text-sm text-neutral-700 dark:text-neutral-300 mt-1 truncate">{server?.node?.name || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Image</dt>
              <dd className="text-sm text-neutral-700 dark:text-neutral-300 mt-1 truncate">{server?.image?.name || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Memory</dt>
              <dd className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">{server?.Memory} MB</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">CPU</dt>
              <dd className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">{(server?.Cpu || 0) * 100}%</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Storage</dt>
              <dd className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">{server ? formatStorage(server.Storage) : "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</dt>
              <dd className="mt-1">
                {server?.Suspended ? (
                  <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">Suspended</span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Active</span>
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Server ID</dt>
              <dd className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-1 truncate">{server?.UUID}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Created</dt>
              <dd className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{server?.createdAt ? new Date(server.createdAt).toLocaleString() : "-"}</dd>
            </div>
          </dl>
        </div>

        {/* Danger Zone */}
        <div className="data-animate-card rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800/20 p-5">
          <h2 className="text-lg font-semibold mb-4 text-red-700 dark:text-red-400">Danger Zone</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Delete Server</p>
                <p className="text-xs text-neutral-500">Permanently delete this server and all its data.</p>
              </div>
              <button
                onClick={() => setShowDelete(true)}
                className="rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-medium transition hover:bg-red-700 shrink-0"
              >
                Delete
              </button>
            </div>
            <div className="h-px bg-red-200 dark:bg-red-800/30" />
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Reinstall Server</p>
                <p className="text-xs text-neutral-500">Reinstall from scratch — all data will be lost.</p>
              </div>
              <button
                onClick={handleReinstall}
                disabled={reinstalling}
                className="rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-medium transition hover:bg-red-700 shrink-0 disabled:opacity-50"
              >
                {reinstalling ? "Reinstalling..." : "Reinstall"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/40 rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 pt-5 pb-4 border-b border-neutral-200 dark:border-neutral-700/60">
              <p className="text-sm font-semibold text-neutral-800 dark:text-white">Delete Server</p>
              <p className="text-xs text-neutral-500 mt-0.5">This will permanently delete the server and all its data. This cannot be undone.</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Are you sure you want to delete <strong>{server?.name}</strong>?
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5 justify-end">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
