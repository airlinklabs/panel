import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Layout,
  GridFour,
  Gear,
  Desktop,
  Users,
  Network,
  Cube,
  PuzzlePiece,
  Cloud,
  Key,
  Bell,
  SignOut,
} from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  label: string;
  path: string;
  icon: typeof Layout;
  weight?: IconWeight;
  matchPrefix?: string;
}

const regularNav: NavItem[] = [
  { label: "Servers", path: "/server", icon: Layout, matchPrefix: "/server" },
];

const adminNav: NavItem[] = [
  { label: "Overview", path: "/admin/overview", icon: GridFour, weight: "light" },
  { label: "Settings", path: "/admin/settings", icon: Gear, weight: "light" },
  { label: "Servers", path: "/admin/servers", icon: Desktop, weight: "light" },
  { label: "Users", path: "/admin/users", icon: Users, weight: "light" },
  { label: "Nodes", path: "/admin/nodes", icon: Network, weight: "light" },
  { label: "Images", path: "/admin/images", icon: Cube, weight: "light" },
  { label: "Addons", path: "/admin/addons", icon: PuzzlePiece, weight: "light" },
  { label: "Airlink Cloud", path: "/admin/airlink-cloud", icon: Cloud, weight: "light" },
  { label: "API Keys", path: "/admin/apikeys", icon: Key, weight: "light" },
];

const consumerNav: NavItem[] = [
  { label: "Overview", path: "/consumer/overview", icon: GridFour, weight: "light" },
  { label: "Create Server", path: "/consumer/create-server", icon: GridFour, weight: "light" },
  { label: "API Keys", path: "/consumer/api-keys", icon: Key, weight: "light" },
];

function SidebarNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <li className="nav-item">
      <NavLink
        to={item.path}
        end={item.path === "/"}
        className={({ isActive }) =>
          cn(
            "nav-link mt-1 group flex gap-x-3 px-4 mx-4 py-1.5 rounded-xl text-sm leading-6 font-normal transition-all duration-200",
            isActive
              ? "text-neutral-950 dark:text-white"
              : "text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl bg-[var(--theme-accent,#6366f1)]/10 border border-[var(--theme-accent,#6366f1)]/20"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Icon
              weight={item.weight ?? "regular"}
              className="w-4 h-4 mt-0.5 shrink-0 relative"
            />
            <span className="relative">{item.label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const { user } = useAuth();

  const handleLogout = async () => {
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
    <aside
      id="pc-sidebar"
      className={cn(
        "hidden lg:fixed lg:inset-y-0 lg:z-10 lg:flex lg:w-56 lg:flex-col left-0",
        "bg-white/90 dark:bg-neutral-900/80 border-r border-neutral-200/60 dark:border-white/5"
      )}
    >
      <div className="flex flex-col h-full">
        <div className="pl-6 pt-4 pb-4 flex min-w-0 shrink-0">
          <a href="/" className="flex items-center min-w-0">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="logo-bg bg-neutral-950/90 p-1 dark:bg-transparent h-10 w-10 rounded-xl mr-3 shrink-0 inline-flex"
            />
            <h1 className="text-neutral-700 dark:text-white font-medium tracking-tight text-lg truncate min-w-0">
              Airlink
            </h1>
          </a>
        </div>

        {user && (
          <a
            href="/account"
            className="sidebar-special-link flex items-center space-x-4 py-4 px-4 border-y border-neutral-800/10 dark:border-white/5 shrink-0 hover:bg-neutral-100 dark:hover:bg-white/[0.05] transition-colors group"
          >
            <img
              className="h-8 w-8 rounded-xl border border-neutral-700/10 shrink-0"
              src={avatarSrc}
              alt="User avatar"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-700 dark:text-white truncate group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                <span>{user.username}</span>
                <span className="text-xs text-neutral-500">
                  <sup className="mt-1">
                    #{String(user.id ?? 1).padStart(4, "0")}
                  </sup>
                </span>
              </p>
              {user.description && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                  {user.description}
                </p>
              )}
            </div>
          </a>
        )}

        <nav className="flex-1 overflow-y-auto">
          <ul role="list" className="py-2">
            <li>
              <ul role="list" className="-mx-2 space-y-1 relative">
                <div className="ml-1.5 absolute left-2 w-[calc(97%-1.5rem)] h-9 z-0 bg-[var(--theme-accent,#6366f1)]/10 border border-[var(--theme-accent,#6366f1)]/20 rounded-xl opacity-0" />
                {regularNav.map((item) => (
                  <SidebarNavItem key={item.path} item={item} />
                ))}

                {user?.isAdmin && (
                  <>
                    <p className="pl-8 text-neutral-600 dark:text-neutral-400 text-xs font-medium pt-6 pb-2">
                      <span>Admin Panel</span>
                    </p>
                    {adminNav.map((item) => (
                      <SidebarNavItem key={item.path} item={item} />
                    ))}
                  </>
                )}

                {!user?.isAdmin && (
                  <>
                    <p className="pl-8 text-neutral-600 dark:text-neutral-400 text-xs font-medium pt-6 pb-2">
                      My Panel
                    </p>
                    {consumerNav.map((item) => (
                      <SidebarNavItem key={item.path} item={item} />
                    ))}
                  </>
                )}
              </ul>
            </li>
          </ul>
        </nav>

        <div className="shrink-0 border-t border-neutral-800/10 dark:border-white/5">
          <div className="relative px-3 py-2">
            <NotificationBell />
          </div>
          <form action="/logout" method="POST" data-turbo="false" className="w-full">
            <button
              type="submit"
              onClick={handleLogout}
              className="sidebar-special-link group flex gap-x-3 pl-6 py-4 text-sm font-medium leading-6 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 transition-colors duration-200 w-full"
            >
              <SignOut weight="light" className="w-5 h-5 mt-0.5 shrink-0" />
              <span>Logout</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
