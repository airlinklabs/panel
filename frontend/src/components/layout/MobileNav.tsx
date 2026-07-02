import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  MagnifyingGlass,
  Bell,
  X,
  Layout,
  Hamburger,
  SignOut,
  DotsThree,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  label: string;
  path: string;
  icon: typeof Layout;
  matchPrefix?: string;
}

const mainNav: NavItem[] = [
  { label: "Servers", path: "/server", icon: Layout, matchPrefix: "/server" },
];

const overflowNav: NavItem[] = [
  { label: "Overview", path: "/admin/overview", icon: Layout },
  { label: "Settings", path: "/admin/settings", icon: Layout },
  { label: "Servers", path: "/admin/servers", icon: Layout },
  { label: "Users", path: "/admin/users", icon: Layout },
  { label: "Nodes", path: "/admin/nodes", icon: Layout },
  { label: "Images", path: "/admin/images", icon: Layout },
  { label: "Addons", path: "/admin/addons", icon: Layout },
  { label: "Airlink Cloud", path: "/admin/airlink-cloud", icon: Layout },
  { label: "API Keys", path: "/admin/apikeys", icon: Layout },
];

export function MobileNav() {
  const { user } = useAuth();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const handleLogout = async () => {
    setOverflowOpen(false);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {}
    window.location.href = "/login";
  };

  const avatarSrc =
    user?.avatar ||
    `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user?.username || "U")}`;

  return (
    <>
      <div
        id="mobile-topbar"
        className="mobile-top-bar al-topbar fixed top-0 left-0 right-0 z-10 h-14 bg-white/90 dark:bg-neutral-900/80 border-b border-neutral-200/60 dark:border-white/5"
      >
        <div className="flex items-center justify-between h-14 px-4">
          <a href="/" className="flex items-center gap-2 min-w-0 flex-1 mr-3">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="logo-bg h-8 w-8 rounded-xl bg-neutral-950/90 dark:bg-transparent p-0.5 shrink-0"
            />
            <span className="text-sm font-medium text-neutral-800 dark:text-white truncate">
              Airlink
            </span>
          </a>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition"
              aria-label="Open navigation search"
            >
              <MagnifyingGlass className="h-5 w-5" />
            </button>
            <div className="relative" id="notification-bell-container">
              <button
                className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition relative"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="hidden absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                  0
                </span>
              </button>
            </div>
            <button
              role="switch"
              aria-checked="false"
              className="al-switch relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-500 bg-neutral-300 dark:bg-neutral-700/70 border border-neutral-400 dark:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-950 shrink-0"
              aria-label="Switch to dark mode"
            >
              <span className="al-switch-dot inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-500 border border-neutral-950/20" />
            </button>
            <a href="/account" className="flex items-center justify-center p-1.5 min-w-[44px] min-h-[44px]">
              <img
                className="h-8 w-8 rounded-xl border border-neutral-200 dark:border-neutral-700"
                src={avatarSrc}
                alt="User avatar"
              />
            </a>
          </div>
        </div>
        <div className="hidden items-center h-14 px-3 gap-2">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 dark:text-neutral-300 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
            aria-label="Close navigation search"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="al-mobile-search-shell flex-1 flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 gap-2">
            <MagnifyingGlass className="h-4 w-4 text-neutral-400 shrink-0" />
            <input
              type="search"
              autoComplete="off"
              placeholder="Search navigation..."
              className="flex-1 bg-transparent text-sm text-neutral-800 dark:text-white placeholder-neutral-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <nav
        id="mobile-bottom-nav"
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-neutral-900 border-t border-neutral-200/60 dark:border-white/5"
      >
        <ul className="relative flex items-center justify-around h-16">
          {mainNav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path} className="flex-1 relative z-10">
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  className="mobile-nav-link flex flex-col items-center justify-center h-16 gap-1 text-neutral-500 dark:text-neutral-400"
                >
                  <div className="w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:shrink-0">
                    <Icon />
                  </div>
                  <span className="text-[11px] font-medium">{item.label}</span>
                </NavLink>
              </li>
            );
          })}

          {user?.isAdmin && overflowNav.length > 0 && (
            <li className="flex-1 relative z-10">
              <button
                onClick={() => setOverflowOpen(true)}
                className="flex flex-col items-center justify-center w-full h-16 gap-1 text-neutral-500 dark:text-neutral-400"
              >
                <DotsThree className="w-5 h-5" />
                <span className="text-[11px] font-medium">More</span>
              </button>
            </li>
          )}

          <li className="flex-1 relative z-10">
            <a
              href="/menu"
              className="mobile-nav-link flex flex-col items-center justify-center h-16 gap-1 text-neutral-500 dark:text-neutral-400"
            >
              <Hamburger className="shrink-0" style={{ width: 18, height: 18 }} />
              <span className="text-[11px] font-medium">Menu</span>
            </a>
          </li>

          <li className="flex-1 relative z-10">
            <button
              onClick={handleLogout}
              className="mobile-nav-link flex flex-col items-center justify-center h-16 gap-1 text-neutral-500 dark:text-neutral-400"
            >
              <SignOut className="w-5 h-5" />
              <span className="text-[11px] font-medium">Logout</span>
            </button>
          </li>
        </ul>
      </nav>

      {overflowOpen && (
        <>
          <div
            className="fixed inset-0 z-[20] bg-black/50 transition-opacity duration-200"
            onClick={() => setOverflowOpen(false)}
          />
          <div
            className={cn(
              "mobile-more-sheet fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-neutral-800 border-t border-neutral-200/30 dark:border-white/5 rounded-t-2xl transition-transform duration-300 ease-out"
            )}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-sm font-medium text-neutral-800 dark:text-white">
                More
              </p>
              <button
                onClick={() => setOverflowOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition"
                aria-label="Close more navigation"
              >
                <X style={{ width: 16, height: 16 }} className="shrink-0" />
              </button>
            </div>
            <div className="px-4 pb-8 space-y-1">
              {overflowNav.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5 transition"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 shrink-0 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0">
                      <Icon />
                    </div>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {item.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
