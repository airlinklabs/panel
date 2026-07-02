import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeSlash, Spinner } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";
import { csrfFetch } from "@/lib/csrf";

export function RegisterPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const pwScore = [
    password.length >= 8,
    /[A-Za-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const pwColors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  const pwLabels = ["Too short", "Weak", "Fair", "Strong"];
  const pwWidths = ["25%", "50%", "75%", "100%"];

  const pwIndex = Math.max(0, pwScore - 1);
  const pwEmpty = password.length === 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await csrfFetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || data.message || "Registration failed"
        );
      }

      toast("Account created! Please sign in.", "success");
      navigate("/login");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .reg-auth-input:focus {
          border-color: #a3a3a3;
          box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
        }
        .dark .reg-auth-input:focus {
          border-color: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.08);
        }
        .reg-submit:hover:not(:disabled) {
          background: #1d2925;
          transform: translateY(-1px);
        }
        .reg-submit:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
        .reg-pw-toggle:hover {
          color: #737373;
        }
        .dark .reg-pw-toggle:hover {
          color: #d4d4d4;
        }
        .reg-panel {
          opacity: 0;
          transform: translateX(-12px);
          transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .reg-panel.visible {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Left panel */}
        <div
          className={`reg-panel ${panelVisible ? "visible" : ""}`}
          style={{
            width: "100%",
            maxWidth: 460,
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
              Create account
            </h1>
            <p style={{ fontSize: 14, color: "#737373", marginTop: 4 }}>
              Airlink Panel
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
              {/* Username + Email side by side */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
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
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="johndoe"
                    required
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    maxLength={20}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #e5e5e5",
                      background:
                        "color-mix(in srgb, #f9fafb 84%, white)",
                      fontSize: 14,
                      color: "#171717",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      transition:
                        "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
                    }}
                    className="reg-auth-input dark:!bg-[rgba(255,255,255,0.08)] dark:!border-[rgba(255,255,255,0.08)] dark:!text-neutral-200"
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #e5e5e5",
                      background:
                        "color-mix(in srgb, #f9fafb 84%, white)",
                      fontSize: 14,
                      color: "#171717",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      transition:
                        "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
                    }}
                    className="reg-auth-input dark:!bg-[rgba(255,255,255,0.08)] dark:!border-[rgba(255,255,255,0.08)] dark:!text-neutral-200"
                  />
                </div>
              </div>

              {/* Password */}
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
                    autoComplete="new-password"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #e5e5e5",
                      background:
                        "color-mix(in srgb, #f9fafb 84%, white)",
                      fontSize: 14,
                      color: "#171717",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      transition:
                        "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
                    }}
                    className="reg-auth-input dark:!bg-[rgba(255,255,255,0.08)] dark:!border-[rgba(255,255,255,0.08)] dark:!text-neutral-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="reg-pw-toggle"
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
                    {showPassword ? (
                      <EyeSlash size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>

                {/* Password strength bar */}
                <div
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: "#e5e5e5",
                    marginTop: 8,
                    overflow: "hidden",
                  }}
                  className="dark:!bg-[rgba(255,255,255,0.08)]"
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      width: pwEmpty ? "0%" : pwWidths[pwIndex],
                      background: pwEmpty
                        ? "transparent"
                        : pwColors[pwIndex],
                      transition:
                        "width 0.28s ease, background 0.28s ease",
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "#a3a3a3",
                    marginTop: 5,
                    minHeight: 14,
                    transition: "color 0.2s",
                  }}
                  className="dark:!text-neutral-400"
                >
                  {pwEmpty
                    ? "8+ characters, one letter, one number."
                    : pwLabels[pwIndex]}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="reg-submit"
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
                  "Create account"
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
            Already have an account?{" "}
            <Link
              to="/login"
              style={{ fontWeight: 500, color: "#171717" }}
              className="dark:!text-neutral-200"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Right wallpaper */}
        <div
          style={{
            flex: 1,
            background:
              "url('/assets/wallpapers/register.jpeg') center/cover no-repeat",
          }}
          className="hidden lg:block"
        />
      </div>
    </>
  );
}
