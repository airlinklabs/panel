import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  User,
  Lock,
  Palette,
  Key,
  Shield,
  Bell,
  Camera,
  Check,
  X,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

type Tab = "profile" | "password" | "theme" | "api-keys" | "2fa" | "notifications";

interface ApiKey {
  id: number;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "password", label: "Password", icon: Lock },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "2fa", label: "Two-Factor", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export function AccountPage() {
  const { user, setUser } = useAuth();
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [description, setDescription] = useState(user?.description || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-keys", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.data || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (activeTab === "api-keys") fetchApiKeys();
  }, [activeTab, fetchApiKeys]);

  const handleProfileSave = async () => {
    setSaving(true);
    try {
      if (username !== user?.username) {
        const res = await fetch("/update-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newUsername: username }),
          credentials: "same-origin",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update username");
        }
      }
      if (description !== (user?.description || "")) {
        await fetch("/update-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
          credentials: "same-origin",
        });
      }
      if (email !== user?.email) {
        const res = await fetch("/change-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          credentials: "same-origin",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update email");
        }
      }
      if (user) {
        setUser({ ...user, username, email, description });
      }
      toast("Profile updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmNewPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to change password");
      }
      toast("Password changed successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to change password", "error");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const res = await fetch("/upload-avatar", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to upload avatar");
      const data = await res.json();
      if (user) setUser({ ...user, avatar: data.avatar });
      toast("Avatar updated", "success");
    } catch {
      toast("Failed to upload avatar", "error");
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to create API key");
      const data = await res.json();
      setApiKeys((prev) => [...prev, data.data]);
      setNewKeyName("");
      toast("API key created", "success");
    } catch {
      toast("Failed to create API key", "error");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (id: number) => {
    try {
      const res = await fetch(`/api/user/api-keys/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to delete API key");
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast("API key deleted", "success");
    } catch {
      toast("Failed to delete API key", "error");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-6">
          Account Settings
        </h1>

        <div className="flex flex-col lg:flex-row gap-6">
          <nav className="lg:w-48 shrink-0">
            <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-all",
                      activeTab === tab.id
                        ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white font-medium"
                        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
                    )}
                  >
                    <Icon className="size-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="flex-1 min-w-0">
            {activeTab === "profile" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  Profile
                </h2>

                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group"
                  >
                    <div className="size-16 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center overflow-hidden">
                      {(user as Record<string, unknown>)?.avatar ? (
                        <img
                          src={String((user as Record<string, unknown>).avatar)}
                          alt="Avatar"
                          className="size-full object-cover"
                        />
                      ) : (
                        <User className="size-6 text-neutral-400 dark:text-neutral-500" />
                      )}
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="size-5 text-white" />
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {user?.username}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {user?.email}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      onClick={handleProfileSave}
                      disabled={saving}
                      className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-4"
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "password" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  Change Password
                </h2>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                      Current password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                      New password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                      Confirm new password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handlePasswordChange}
                      disabled={changingPassword || !currentPassword || !newPassword}
                      className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-4"
                    >
                      {changingPassword ? "Changing..." : "Change password"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "theme" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  Appearance
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-900 dark:text-white mb-3 block">
                      Theme
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      {(["light", "dark"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            if (theme !== t) toggle();
                          }}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all text-left",
                            theme === t
                              ? "border-neutral-900 dark:border-white"
                              : "border-neutral-200/30 dark:border-white/[0.07] hover:border-neutral-300 dark:hover:border-white/20"
                          )}
                        >
                          <div
                            className={cn(
                              "w-full h-20 rounded-lg mb-3",
                              t === "dark" ? "bg-neutral-900" : "bg-neutral-100 border border-neutral-200"
                            )}
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-900 dark:text-white capitalize">
                              {t}
                            </span>
                            {theme === t && <Check className="size-4 text-neutral-900 dark:text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "api-keys" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  API Keys
                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name"
                    className="flex h-9 flex-1 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                  />
                  <button
                    onClick={handleCreateApiKey}
                    disabled={creatingKey || !newKeyName.trim()}
                    className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-1.5 px-3"
                  >
                    {creatingKey ? "Creating..." : "Create"}
                  </button>
                </div>
                <div className="space-y-2">
                  {apiKeys.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 py-4 text-center">
                      No API keys yet
                    </p>
                  ) : (
                    apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-100 dark:border-white/[0.05]"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {key.name}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate">
                            {key.key}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteApiKey(key.id)}
                          className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-3"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "2fa" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Add an extra layer of security to your account with two-factor authentication.
                </p>
                <button className="h-9 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm gap-1.5 px-4">
                  <Shield className="size-4" />
                  Enable 2FA
                </button>
              </motion.div>
            )}

            {activeTab === "notifications" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6"
              >
                <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
                  Notifications
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Notification preferences are managed through your browser settings.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
