import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeSlash, Spinner } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { csrfFetch } from "@/lib/csrf";

export function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { toast } = useToast();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("email", identifier);
      body.append("password", password);

      const res = await csrfFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || "Invalid credentials");
      }

      const statusRes = await csrfFetch("/api/system/status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.data?.user) {
          setUser(statusData.data.user);
        }
      }

      toast("Welcome back!", "success");
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .login-auth-input:focus {
          border-color: #a3a3a3;
          box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
        }
        .dark .login-auth-input:focus {
          border-color: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.08);
        }
        .login-submit:hover:not(:disabled) {
          background: #1d2925;
          transform: translateY(-1px);
        }
        .login-submit:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
        .login-pw-toggle:hover {
          color: #737373;
        }
        .dark .login-pw-toggle:hover {
          color: #d4d4d4;
        }
        .login-panel {
          opacity: 0;
          transform: translateX(-12px);
          transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .login-panel.visible {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Left panel */}
        <div
          className={`login-panel ${panelVisible ? "visible" : ""}`}
          style={{
            width: "100%",
            maxWidth: 420,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "56px 44px",
            background: "color-mix(in srgb, white 92%, transparent)",
            boxShadow: "24px 0 70px rgba(43,55,49,0.12)",
            backdropFilter: "blur(18px)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ marginBottom: 32 }}>
            <img
              src="/assets/logo.png"
              alt="Logo"
              style={{
                height: 40,
                width: 40,
                borderRadius: 12,
                objectFit: "contain",
                marginBottom: 20,
                display: "block",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#171717",
                lineHeight: 1.3,
                margin: 0,
              }}
              className="dark:!text-white"
            >
              Sign in
            </h1>
            <p style={{ fontSize: 14, color: "#737373", marginTop: 4 }}>
              to Airlink Panel
            </p>
          </div>

          {error && (
            <div
              style={{
                borderRadius: 12,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                padding: "12px 16px",
                marginBottom: 20,
              }}
              className="dark:!bg-red-500/10 dark:!border-red-500/20"
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#b91c1c",
                }}
                className="dark:!text-red-400"
              >
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="on" noValidate>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#525252",
                    marginBottom: 6,
                  }}
                  className="dark:!text-neutral-400"
                >
                  Username or email
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="username"
                  spellCheck={false}
                  autoCapitalize="none"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e5e5",
                    background: "color-mix(in srgb, #f9fafb 84%, white)",
                    fontSize: 14,
                    color: "#171717",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    transition:
                      "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
                  }}
                  className="login-auth-input dark:!bg-[rgba(255,255,255,0.08)] dark:!border-[rgba(255,255,255,0.08)] dark:!text-neutral-200"
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#525252",
                    marginBottom: 6,
                  }}
                  className="dark:!text-neutral-400"
                >
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #e5e5e5",
                      background: "color-mix(in srgb, #f9fafb 84%, white)",
                      fontSize: 14,
                      color: "#171717",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      transition:
                        "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
                    }}
                    className="login-auth-input dark:!bg-[rgba(255,255,255,0.08)] dark:!border-[rgba(255,255,255,0.08)] dark:!text-neutral-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="login-pw-toggle"
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "#a3a3a3",
                      lineHeight: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  style={{
                    appearance: "none",
                    height: 16,
                    width: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: "1.5px solid #d4d4d4",
                    background: "white",
                    cursor: "pointer",
                    transition: "background 0.12s, border-color 0.12s",
                    accentColor: "#171717",
                  }}
                  className="dark:!bg-neutral-700 dark:!border-neutral-600"
                />
                <span
                  style={{ fontSize: 14, color: "#737373" }}
                  className="dark:!text-neutral-400"
                >
                  Remember me
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="login-submit"
                style={{
                  width: "100%",
                  padding: 11,
                  borderRadius: 10,
                  background: "#26342f",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: loading ? "default" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 14px 32px rgba(38,52,47,0.22)",
                  transition:
                    "transform 0.2s, background 0.2s, box-shadow 0.2s",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <Spinner
                    size={15}
                    className="animate-spin"
                    weight="bold"
                  />
                ) : (
                  "Sign in"
                )}
              </button>
            </div>
          </form>

          <p
            style={{
              fontSize: 14,
              color: "#737373",
              textAlign: "center",
              marginTop: 24,
            }}
            className="dark:!text-neutral-400"
          >
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              style={{ fontWeight: 500, color: "#171717" }}
              className="dark:!text-neutral-200"
            >
              Create one
            </Link>
          </p>
        </div>

        {/* Right wallpaper */}
        <div
          style={{
            flex: 1,
            background:
              "url('/assets/wallpapers/login.jpeg') center/cover no-repeat",
          }}
          className="hidden lg:block"
        />
      </div>
    </>
  );
}
