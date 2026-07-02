import { useState, useEffect, useCallback } from "react";
import { FloppyDisk, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";

interface AppearanceSettings {
  title: string;
  description: string;
  logo: string;
  theme: string;
}

interface ServerPolicySettings {
  allowRegistration: boolean;
  allowUserCreateServer: boolean;
  allowUserDeleteServer: boolean;
  uploadLimit: number;
  defaultServerLimit: number;
  defaultMaxMemory: number;
  defaultMaxCpu: number;
  defaultMaxStorage: number;
}

interface SecuritySettings {
  rateLimitEnabled: boolean;
  rateLimitRpm: number;
  loginMaxAttempts: number;
  loginLockoutMinutes: number;
  behindReverseProxy: boolean;
  enforceDaemonHttps: boolean;
  hashApiKeys: boolean;
  ipBans: string[];
}

const tabs = [
  { id: "appearance", label: "Appearance" },
  { id: "servers", label: "Servers" },
  { id: "security", label: "Security" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AdminSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBan, setNewBan] = useState("");

  const [appearance, setAppearance] = useState<AppearanceSettings>({
    title: "Airlink Panel",
    description: "",
    logo: "",
    theme: "dark",
  });

  const [policy, setPolicy] = useState<ServerPolicySettings>({
    allowRegistration: true,
    allowUserCreateServer: true,
    allowUserDeleteServer: true,
    uploadLimit: 100,
    defaultServerLimit: 5,
    defaultMaxMemory: 1024,
    defaultMaxCpu: 100,
    defaultMaxStorage: 10240,
  });

  const [security, setSecurity] = useState<SecuritySettings>({
    rateLimitEnabled: true,
    rateLimitRpm: 60,
    loginMaxAttempts: 5,
    loginLockoutMinutes: 15,
    behindReverseProxy: false,
    enforceDaemonHttps: false,
    hashApiKeys: false,
    ipBans: [],
  });

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get<{ data: { appearance: AppearanceSettings; serverPolicy: ServerPolicySettings; security: SecuritySettings } }>("/api/admin/settings");
      if (res.data?.appearance) setAppearance(res.data.appearance);
      if (res.data?.serverPolicy) setPolicy(res.data.serverPolicy);
      if (res.data?.security) setSecurity(res.data.security);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveAppearance = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", appearance.title);
      fd.append("description", appearance.description);
      fd.append("theme", appearance.theme);
      await api.upload("/admin/settings", fd);
      toast("Appearance saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      await api.post("/admin/settings/server-policy", policy);
      toast("Server policy saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSecurity = async () => {
    setSaving(true);
    try {
      await api.post("/admin/settings/security", security);
      toast("Security settings saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const addBan = () => {
    if (newBan && !security.ipBans.includes(newBan)) {
      setSecurity((prev) => ({ ...prev, ipBans: [...prev.ipBans, newBan] }));
      setNewBan("");
    }
  };

  const removeBan = (ip: string) => {
    setSecurity((prev) => ({ ...prev, ipBans: prev.ipBans.filter((b) => b !== ip) }));
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto pt-16">
        <div className="px-8 pt-6 pb-4">
          <div className="h-6 w-32 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse mt-2" />
        </div>
        <div className="px-8">
          <div className="h-96 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-12">
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Manage your panel configuration.</p>
      </div>

      <div className="px-8">
        <div className="flex gap-0.5 mb-6 border-b border-neutral-200 dark:border-neutral-700/40">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition -mb-px border-b-2",
                activeTab === tab.id
                  ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "appearance" && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveAppearance(); }}
            className="space-y-5"
          >
            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Branding</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 px-5 py-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Site title</label>
                  <input
                    type="text"
                    value={appearance.title}
                    onChange={(e) => setAppearance((p) => ({ ...p, title: e.target.value }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Logo</label>
                  <input
                    type="url"
                    value={appearance.logo}
                    onChange={(e) => setAppearance((p) => ({ ...p, logo: e.target.value }))}
                    placeholder="Logo URL"
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                  {appearance.logo && (
                    <img src={appearance.logo} alt="Logo" className="h-8 mt-2 object-contain" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Favicon</label>
                  <input
                    type="text"
                    placeholder="Favicon URL"
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Registration</h2>
              <div className="px-5 py-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-white">Allow public registration</p>
                  <p className="text-xs text-neutral-500 mt-0.5">When off, only admins can create new accounts.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={policy.allowRegistration}
                    onChange={(e) => setPolicy((p) => ({ ...p, allowRegistration: e.target.checked }))}
                    className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="submit" className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90">
                Save appearance
              </button>
            </div>
          </form>
        )}

        {activeTab === "servers" && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">User permissions</h2>
              <div className="px-5 py-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Allow users to create servers</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Users can create their own servers up to their limit.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={policy.allowUserCreateServer}
                      onChange={(e) => setPolicy((p) => ({ ...p, allowUserCreateServer: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Allow users to delete servers</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Users can delete servers they own.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={policy.allowUserDeleteServer}
                      onChange={(e) => setPolicy((p) => ({ ...p, allowUserDeleteServer: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">File uploads</h2>
              <div className="px-5 py-5">
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Upload limit <span className="text-neutral-400 font-normal">(MB)</span></label>
                <div className="relative max-w-xs">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={policy.uploadLimit}
                    onChange={(e) => setPolicy((p) => ({ ...p, uploadLimit: parseInt(e.target.value) || 100 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 pr-12 text-neutral-800 dark:text-white transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">MB</span>
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">Maximum file size users can upload via the file manager.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Default limits</h2>
              <p className="text-xs text-neutral-500 px-5 pt-3">Applied to new users unless overridden per-user.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-5 py-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Server limit</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={policy.defaultServerLimit}
                    onChange={(e) => setPolicy((p) => ({ ...p, defaultServerLimit: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                  <p className="mt-1 text-xs text-neutral-500">0 = cannot create.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Max memory</label>
                  <input
                    type="number"
                    min={1}
                    value={policy.defaultMaxMemory}
                    onChange={(e) => setPolicy((p) => ({ ...p, defaultMaxMemory: parseInt(e.target.value) || 128 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Max CPU <span className="text-neutral-400 font-normal">(%)</span></label>
                  <input
                    type="number"
                    min={50}
                    max={10000}
                    value={policy.defaultMaxCpu}
                    onChange={(e) => setPolicy((p) => ({ ...p, defaultMaxCpu: parseInt(e.target.value) || 100 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Max storage</label>
                  <input
                    type="number"
                    min={1}
                    value={policy.defaultMaxStorage}
                    onChange={(e) => setPolicy((p) => ({ ...p, defaultMaxStorage: parseInt(e.target.value) || 1024 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
              </div>
              <div className="px-5 pb-5 border-t border-neutral-200 dark:border-white/5 pt-4 flex justify-end">
                <button onClick={savePolicy} className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Rate limiting</h2>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Enable rate limiting</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Limit requests per minute per IP address.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={security.rateLimitEnabled}
                      onChange={(e) => setSecurity((p) => ({ ...p, rateLimitEnabled: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
                {security.rateLimitEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Requests per minute</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={security.rateLimitRpm}
                      onChange={(e) => setSecurity((p) => ({ ...p, rateLimitRpm: parseInt(e.target.value) || 60 }))}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-48 bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Login protection</h2>
              <p className="text-xs text-neutral-500 px-5 pt-3">After N failed attempts from a single account, that account is locked for the configured duration.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 py-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Max failed attempts before lockout</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={security.loginMaxAttempts}
                    onChange={(e) => setSecurity((p) => ({ ...p, loginMaxAttempts: parseInt(e.target.value) || 5 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">Lockout duration <span className="text-neutral-400 font-normal">(minutes)</span></label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={security.loginLockoutMinutes}
                    onChange={(e) => setSecurity((p) => ({ ...p, loginLockoutMinutes: parseInt(e.target.value) || 15 }))}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">Network</h2>
              <div className="px-5 py-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Behind a reverse proxy</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Enable if Nginx, Caddy, or another proxy sits in front.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={security.behindReverseProxy}
                      onChange={(e) => setSecurity((p) => ({ ...p, behindReverseProxy: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Enforce HTTPS for daemon connections</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Panel contacts daemons over HTTPS. Only enable if your daemons have TLS configured.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={security.enforceDaemonHttps}
                      onChange={(e) => setSecurity((p) => ({ ...p, enforceDaemonHttps: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white">Hash API keys at rest</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Store API keys as SHA-256 hashes in the database.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={security.hashApiKeys}
                      onChange={(e) => setSecurity((p) => ({ ...p, hashApiKeys: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                    />
                  </label>
                </div>
              </div>
              <div className="px-5 pb-5 border-t border-neutral-200 dark:border-white/5 pt-4 flex justify-end">
                <button onClick={saveSecurity} className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90">
                  Save security settings
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-neutral-800 rounded-t-xl border-b border-neutral-200 dark:border-white/5">IP banning</h2>
              <div className="px-5 py-5">
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={newBan}
                    onChange={(e) => setNewBan(e.target.value)}
                    placeholder="192.168.1.1"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBan())}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm bg-neutral-100 dark:bg-neutral-700 px-4 py-2 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors flex-1 max-w-xs"
                  />
                  <button
                    type="button"
                    onClick={addBan}
                    className="rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-medium transition hover:bg-red-700"
                  >
                    Ban IP
                  </button>
                </div>
                <div className="space-y-2">
                  {security.ipBans.length === 0 ? (
                    <p className="text-sm text-neutral-400">No banned IPs.</p>
                  ) : (
                    security.ipBans.map((ip) => (
                      <div
                        key={ip}
                        className="flex items-center justify-between rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 px-4 py-2.5"
                      >
                        <span className="text-sm font-mono text-neutral-700 dark:text-neutral-300">{ip}</span>
                        <button
                          type="button"
                          onClick={() => removeBan(ip)}
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition"
                        >
                          Unban
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
