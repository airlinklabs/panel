import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Envelope, Lock, ArrowRight, Loader2, CheckCircle, XCircle } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";

interface ValidationState {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validation: ValidationState = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const passwordValid = Object.values(validation).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passwordValid) {
      setError("Password does not meet requirements");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
        credentials: "same-origin",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || "Registration failed");
      }

      toast("Account created! Please sign in.", "success");
      navigate("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const ValidationIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
    ) : (
      <XCircle className="size-3.5 text-neutral-300 dark:text-neutral-600 shrink-0" />
    );

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-neutral-900 dark:bg-black relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 text-center px-8"
        >
          <h1 className="font-display text-4xl font-bold text-white tracking-tight mb-4">
            Airlink Panel
          </h1>
          <p className="text-neutral-400 text-lg max-w-md">
            Create your account and start managing game servers in minutes.
          </p>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-neutral-50 dark:bg-neutral-950">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden mb-8 text-center">
            <h1 className="font-display text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
              Airlink Panel
            </h1>
          </div>

          <h2 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-1">
            Create account
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">
            Fill in the details to get started
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
            >
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  minLength={3}
                  maxLength={32}
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-10 pr-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                Email
              </label>
              <div className="relative">
                <Envelope className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-10 pr-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-10 pr-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
              {password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-2 space-y-1"
                >
                  {(
                    [
                      ["length", "At least 8 characters"],
                      ["uppercase", "One uppercase letter"],
                      ["lowercase", "One lowercase letter"],
                      ["number", "One number"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <ValidationIcon ok={validation[key]} />
                      <span
                        className={`text-xs ${
                          validation[key]
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  className={`flex h-10 w-full rounded-xl border bg-white dark:bg-white/5 pl-10 pr-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? "border-emerald-300 dark:border-emerald-500/30 focus:ring-emerald-400 dark:focus:ring-emerald-500"
                        : "border-red-300 dark:border-red-500/30 focus:ring-red-400 dark:focus:ring-red-500"
                      : "border-neutral-200 dark:border-white/10 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                  }`}
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !passwordValid || !passwordsMatch}
              className="w-full h-10 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-2"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Create account
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-neutral-900 dark:text-white hover:underline"
            >
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
