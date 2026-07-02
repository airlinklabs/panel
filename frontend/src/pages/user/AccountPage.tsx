import { useState, useEffect, useCallback, useRef } from "react";
import {
  User,
  Lock,
  Shield,
  EnvelopeSimple,
  FileText,
  Globe,
  Upload,
  X,
  Info,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { csrfFetch } from "@/lib/csrf";

interface LoginHistory {
  timestamp: string;
  ipAddress: string;
  userAgent: string;
}

export function AccountPage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [description, setDescription] = useState(user?.description || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [usernameFeedback, setUsernameFeedback] = useState("Checking...");
  const [passwordFeedback, setPasswordFeedback] = useState("Checking...");
  const [saving, setSaving] = useState(false);

  const [language, setLanguage] = useState("en");
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);

  const [animationsDisabled, setAnimationsDisabled] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [fontSize, setFontSize] = useState("medium");

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/user/preferences", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          if (data.language) setLanguage(data.language);
          if (data.fontSize) setFontSize(data.fontSize);
          if (data.animationsDisabled !== undefined) setAnimationsDisabled(data.animationsDisabled);
          if (data.highContrast !== undefined) setHighContrast(data.highContrast);
          if (data.compactMode !== undefined) setCompactMode(data.compactMode);
        }
      } catch {
        // silently fail
      }
    };
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/user/login-history", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          setLoginHistory(data.data || []);
        }
      } catch {
        // silently fail
      }
    };
    fetchUserData();
    fetchHistory();
  }, []);

  const checkUsername = useCallback(async (val: string) => {
    if (!val) {
      setUsernameFeedback("");
      return;
    }
    try {
      const res = await fetch(`/check-username?username=${encodeURIComponent(val)}`);
      const { exists } = await res.json();
      setUsernameFeedback(exists ? "Taken" : "Available");
    } catch {
      setUsernameFeedback("");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username && username !== user?.username) {
        checkUsername(username);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, user?.username, checkUsername]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!currentPassword) {
        setPasswordFeedback("");
        setNewPassword("");
        return;
      }
      try {
        const res = await csrfFetch("/validate-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword }),
        });
        const { valid } = await res.json();
        setPasswordFeedback(valid ? "Correct" : "Incorrect");
      } catch {
        setPasswordFeedback("Could not validate");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentPassword]);

  const handleAvatarUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast("Image must be under 2 MB", "error");
      return;
    }
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const res = await csrfFetch("/upload-avatar", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload avatar");
      const data = await res.json();
      if (user) setUser({ ...user, avatar: data.avatar });
      toast("Avatar updated", "success");
    } catch {
      toast("Failed to upload avatar", "error");
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await csrfFetch("/remove-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        if (user) setUser({ ...user, avatar: "" });
        toast("Profile picture removed.", "success");
        setTimeout(() => location.reload(), 1200);
      } else {
        toast("Something went wrong.", "error");
      }
    } catch {
      toast("Something went wrong.", "error");
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await csrfFetch("/update-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername: username.trim() }),
      });
      if (res.ok) {
        toast("Username updated.", "success");
        if (user) setUser({ ...user, username: username.trim() });
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to update username", "error");
      }
    } catch {
      toast("Failed to update username", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await csrfFetch("/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        toast("Email updated.", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to update email", "error");
      }
    } catch {
      toast("Failed to update email", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDescriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await csrfFetch("/update-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      if (res.ok) {
        toast("Description updated.", "success");
        if (user) setUser({ ...user, description: description.trim() });
      } else {
        toast("Failed to update description", "error");
      }
    } catch {
      toast("Failed to update description", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await csrfFetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        toast("Password updated.", "success");
        setTimeout(() => (location.href = "/login?err=UpdatedCredentials"), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to change password", "error");
      }
    } catch {
      toast("Failed to change password", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await csrfFetch("/set-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (res.ok) {
        toast("Language saved.", "success");
        setTimeout(() => location.reload(), 1400);
      } else {
        toast("Something went wrong.", "error");
      }
    } catch {
      toast("Something went wrong.", "error");
    }
  };

  const toggleAnimations = async () => {
    const newState = !animationsDisabled;
    setAnimationsDisabled(newState);
    if (newState) {
      document.documentElement.classList.add("animations-disabled");
    } else {
      document.documentElement.classList.remove("animations-disabled");
    }
    await csrfFetch("/account/animations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animationsDisabled: String(newState) }),
    });
  };

  const toggleContrast = async () => {
    const newState = !highContrast;
    setHighContrast(newState);
    if (newState) {
      document.documentElement.classList.add("high-contrast");
    } else {
      document.documentElement.classList.remove("high-contrast");
    }
    await csrfFetch("/account/high-contrast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highContrast: String(newState) }),
    });
  };

  const toggleCompact = async () => {
    const newState = !compactMode;
    setCompactMode(newState);
    if (newState) {
      document.documentElement.classList.add("compact-mode");
    } else {
      document.documentElement.classList.remove("compact-mode");
    }
    await csrfFetch("/account/compact-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compactMode: String(newState) }),
    });
  };

  const handleFontSize = async (size: string) => {
    setFontSize(size);
    document.documentElement.classList.remove("text-size-small", "text-size-medium", "text-size-large");
    if (size !== "medium") document.documentElement.classList.add(`text-size-${size}`);
    await csrfFetch("/account/font-size", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fontSize: size }),
    });
  };

  const avatarSrc = user?.avatar
    || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user?.username || "unknown")}`;

  return (
    <main className="flex-1 overflow-y-auto pt-16 pb-12">
      <div className="px-8 pt-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              id="avatar-preview"
              src={avatarSrc}
              alt="Avatar"
              className="h-12 w-12 rounded-xl border border-neutral-200 dark:border-white/10 object-cover"
            />
            <label
              htmlFor="avatar-input"
              title="Upload photo"
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-neutral-800 dark:bg-white border-2 border-white dark:border-neutral-900 cursor-pointer hover:bg-neutral-700 dark:hover:bg-neutral-200 transition"
            >
              <Upload className="w-3 h-3 text-white dark:text-neutral-900" weight={2.5} />
            </label>
            <input
              id="avatar-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
            {user?.avatar && (
              <button
                id="remove-avatar-btn"
                type="button"
                title="Remove photo"
                onClick={handleRemoveAvatar}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500 border-2 border-white dark:border-neutral-900 transition"
              >
                <X className="w-3 h-3 text-white" weight={2.5} />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-medium text-neutral-800 dark:text-white">
              Account
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Manage your profile and preferences.
            </p>
          </div>
          <a
            href="/credits"
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white px-3 py-1.5 text-xs font-medium shadow-sm dark:shadow-none transition shrink-0"
          >
            <Info className="w-3.5 h-3.5" />
            Credits
          </a>
        </div>
      </div>

      <div className="px-8 space-y-4">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-white/5 p-5">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <form id="change-username-form" onSubmit={handleUsernameSubmit} className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <User className="w-3 h-3" />
                Username
              </label>
              <div className="flex gap-1.5">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={user?.username}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={saving || !username || username === user?.username}
                  className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Save
                </button>
              </div>
              <span id="username-feedback" className="mt-1 text-[11px] text-neutral-400 inline-block">
                {username && username !== user?.username ? usernameFeedback : ""}
              </span>
            </form>

            <form id="change-email-form" onSubmit={handleEmailSubmit} className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <EnvelopeSimple className="w-3 h-3" />
                Email
              </label>
              <div className="flex gap-1.5">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={user?.email}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={saving || !email || email === user?.email}
                  className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Save
                </button>
              </div>
            </form>

            <form id="change-password-form" onSubmit={handlePasswordSubmit} className="col-span-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Lock className="w-3 h-3" />
                Change password
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span id="current-password-feedback" className="text-[11px] text-neutral-400 block mb-1">
                    {currentPassword ? passwordFeedback : "Checking..."}
                  </span>
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-transparent block mb-1">.</span>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    disabled={passwordFeedback !== "Correct"}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors disabled:opacity-50"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving || !currentPassword || !newPassword || passwordFeedback !== "Correct"}
                className="mt-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Update password
              </button>
            </form>

            <form id="change-description-form" onSubmit={handleDescriptionSubmit} className="col-span-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <FileText className="w-3 h-3" />
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white placeholder-neutral-400 transition-colors resize-none"
                placeholder={user?.description || ""}
              />
              <button
                type="submit"
                disabled={saving}
                className="mt-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </form>

            <form id="language-preference-form" onSubmit={handleLanguageSubmit} className="col-span-1 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Globe className="w-3 h-3" />
                Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-white/30 focus:outline-none text-xs w-full bg-white dark:bg-neutral-700 px-3 py-1.5 text-neutral-800 dark:text-white transition-colors"
              >
                <option value="en">English</option>
                <option value="fr">Francais</option>
                <option value="de">Deutsch</option>
                <option value="es">Espanol</option>
                <option value="pt">Portugues</option>
                <option value="it">Italiano</option>
                <option value="ru">Pусский</option>
                <option value="zh">中文</option>
                <option value="ja">日本語</option>
                <option value="ta">தமிழ்</option>
              </select>
              <button
                type="submit"
                className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium transition"
              >
                Save
              </button>
            </form>

            <div className="col-span-1 rounded-xl border border-neutral-200/70 bg-white/70 px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-white">
                    Reduce animations
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Disable motion effects across the panel. Applies on next page load.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={animationsDisabled}
                  onClick={toggleAnimations}
                  className="al-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 bg-neutral-200 dark:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900"
                >
                  <span
                    className="al-switch-dot inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{ transform: `translateX(${animationsDisabled ? "24px" : "4px"})` }}
                  />
                </button>
              </div>
            </div>

            <div className="col-span-1 rounded-xl border border-neutral-200/70 bg-white/70 px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-white">
                    Text size
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Adjust the text size across the panel.
                  </p>
                </div>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Text size">
                  {(["small", "medium", "large"] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={fontSize === size}
                      onClick={() => handleFontSize(size)}
                      className={cn(
                        "px-2.5 py-1 rounded-xl border border-neutral-200 dark:border-white/10 transition",
                        size === "small" && "text-xs",
                        size === "medium" && "text-sm",
                        size === "large" && "text-base",
                        fontSize === size
                          ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5"
                      )}
                    >
                      A
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-span-1 rounded-xl border border-neutral-200/70 bg-white/70 px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-white">
                    High contrast
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Increase contrast for better readability.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={highContrast}
                  onClick={toggleContrast}
                  className="al-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 bg-neutral-200 dark:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900"
                >
                  <span
                    className="al-switch-dot inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{ transform: `translateX(${highContrast ? "24px" : "4px"})` }}
                  />
                </button>
              </div>
            </div>

            <div className="col-span-1 rounded-xl border border-neutral-200/70 bg-white/70 px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-white">
                    Compact mode
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Reduce spacing for a denser layout.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={compactMode}
                  onClick={toggleCompact}
                  className="al-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 bg-neutral-200 dark:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900"
                >
                  <span
                    className="al-switch-dot inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{ transform: `translateX(${compactMode ? "24px" : "4px"})` }}
                  />
                </button>
              </div>
            </div>

            <div className="col-span-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Shield className="w-3 h-3" />
                Two-factor authentication
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Not yet available.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-5 border border-neutral-200 dark:border-white/5">
          <p className="text-sm font-medium text-neutral-800 dark:text-white mb-4">
            Login history
          </p>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-white/5">
            <table className="min-w-full text-sm divide-y divide-neutral-200 dark:divide-white/5">
              <thead className="bg-neutral-100 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Date & Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Browser / Device
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                {loginHistory.length > 0 ? (
                  loginHistory.map((login, i) => (
                    <tr
                      key={i}
                      className="hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {new Date(login.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 whitespace-nowrap font-mono text-xs">
                        {login.ipAddress || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-xs truncate max-w-[260px]">
                        {login.userAgent || "Unknown"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-neutral-400">
                      No login history available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
