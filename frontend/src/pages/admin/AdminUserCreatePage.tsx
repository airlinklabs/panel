import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    isAdmin: false,
    serverLimit: "" as string,
    maxMemory: "" as string,
    maxCpu: "" as string,
    maxStorage: "" as string,
  });
  const [usernameCrit, setUsernameCrit] = useState({ length: false, chars: false });
  const [passwordCrit, setPasswordCrit] = useState({ length: false, letter: false, number: false });

  const checkUsername = (val: string) => {
    const lengthOk = val.length >= 3 && val.length <= 20;
    const charsOk = /^[a-zA-Z0-9]+$/.test(val);
    setUsernameCrit({ length: lengthOk, chars: charsOk });
    return lengthOk && charsOk;
  };

  const checkPassword = (val: string) => {
    const lengthOk = val.length >= 8;
    const letterOk = /[A-Za-z]/.test(val);
    const numberOk = /\d/.test(val);
    setPasswordCrit({ length: lengthOk, letter: letterOk, number: numberOk });
    return lengthOk && letterOk && numberOk;
  };

  const handleSubmit = async () => {
    if (!form.email || !form.username || !form.password) {
      alert("Please fill in all required fields.");
      return;
    }
    if (!checkUsername(form.username)) {
      alert("Username must be 3–20 characters, letters and numbers only.");
      return;
    }
    if (!checkPassword(form.password)) {
      alert("Password must be at least 8 characters with a letter and number.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/admin/users/create-user", {
        email: form.email,
        username: form.username,
        password: form.password,
        isAdmin: form.isAdmin,
        serverLimit: form.serverLimit === "" ? null : parseInt(form.serverLimit, 10),
        maxMemory: form.maxMemory === "" ? null : parseInt(form.maxMemory, 10),
        maxCpu: form.maxCpu === "" ? null : parseInt(form.maxCpu, 10),
        maxStorage: form.maxStorage === "" ? null : parseInt(form.maxStorage, 10),
      });
      navigate("/admin/users");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex-1 p-6 overflow-y-auto pt-16">
      <div className="sm:flex sm:items-center px-8 pt-4">
        <div className="sm:flex-auto">
          <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white">Create User</h1>
          <p className="mt-1 tracking-tight text-sm text-neutral-500">Every great panel needs people. Let's add one.</p>
        </div>
      </div>

      <div className="mt-6 px-8 w-full">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Email:</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"
                placeholder="example@domain.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Username:</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => { update("username", e.target.value); checkUsername(e.target.value); }}
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"
                placeholder="username"
              />
              <div className="mt-2 space-y-1">
                <p className={`text-xs ${form.username ? (usernameCrit.length ? "text-green-500" : "text-red-500") : "text-neutral-400"}`}>
                  <span className="mr-1">{form.username ? (usernameCrit.length ? "✓" : "✗") : "—"}</span> 3–20 characters
                </p>
                <p className={`text-xs ${form.username ? (usernameCrit.chars ? "text-green-500" : "text-red-500") : "text-neutral-400"}`}>
                  <span className="mr-1">{form.username ? (usernameCrit.chars ? "✓" : "✗") : "—"}</span> Letters and numbers only
                </p>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Password:</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => { update("password", e.target.value); checkPassword(e.target.value); }}
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"
                placeholder="********"
              />
              <div className="mt-2 space-y-1">
                <p className={`text-xs ${form.password ? (passwordCrit.length ? "text-green-500" : "text-red-500") : "text-neutral-400"}`}>
                  <span className="mr-1">{form.password ? (passwordCrit.length ? "✓" : "✗") : "—"}</span> At least 8 characters
                </p>
                <p className={`text-xs ${form.password ? (passwordCrit.letter ? "text-green-500" : "text-red-500") : "text-neutral-400"}`}>
                  <span className="mr-1">{form.password ? (passwordCrit.letter ? "✓" : "✗") : "—"}</span> At least one letter
                </p>
                <p className={`text-xs ${form.password ? (passwordCrit.number ? "text-green-500" : "text-red-500") : "text-neutral-400"}`}>
                  <span className="mr-1">{form.password ? (passwordCrit.number ? "✓" : "✗") : "—"}</span> At least one number
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Admin:</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={form.isAdmin}
                    onChange={(e) => update("isAdmin", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-neutral-300 dark:bg-neutral-600 peer-checked:bg-blue-600 rounded-full transition-colors" />
                  <div className="absolute left-0.5 top-0.5 bg-white rounded-full h-5 w-5 transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">Admin access</span>
              </label>
            </div>

            <div className="sm:col-span-2 pt-5 border-t border-neutral-200 dark:border-white/5">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white mb-1">Server limits</h2>
              <p className="text-xs text-neutral-500 mb-3">Leave blank to use the global defaults set in Admin → Settings → Servers.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Server limit</label>
                  <input type="number" min="0" max="100" placeholder="Use global default" value={form.serverLimit} onChange={(e) => update("serverLimit", e.target.value)} className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition" />
                  <p className="mt-1 text-[11px] text-neutral-400">0 = cannot create servers.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Max memory (MB)</label>
                  <input type="number" min="128" max="65536" placeholder="Use global default" value={form.maxMemory} onChange={(e) => update("maxMemory", e.target.value)} className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Max CPU (%)</label>
                  <input type="number" min="10" max="10000" placeholder="Use global default" value={form.maxCpu} onChange={(e) => update("maxCpu", e.target.value)} className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Max storage (GB)</label>
                  <input type="number" min="1" max="10000" placeholder="Use global default" value={form.maxStorage} onChange={(e) => update("maxStorage", e.target.value)} className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-white/5 px-3 py-2.5 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition" />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button onClick={handleSubmit} disabled={submitting} className="rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-800 px-4 py-2.5 text-sm font-medium shadow-md transition hover:bg-neutral-700 dark:hover:bg-neutral-200 disabled:opacity-50">
                {submitting ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
