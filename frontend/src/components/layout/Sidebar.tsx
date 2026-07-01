import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  House,
  PlusSquare,
  User,
  ChartBar,
  Users,
  DesktopTower,
  HardDrives,
  Image,
  PuzzlePiece,
  Gear,
  TrendUp,
  Shield,
  Key,
  ChartLineUp,
  Cloud,
  SignOut,
} from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  label: string;
  path: string;
  icon: typeof House;
  weight?: IconWeight;
}

const regularNav: NavItem[] = [
  { label: "Dashboard", path: "/", icon: House },
  { label: "Create Server", path: "/create-server", icon: PlusSquare },
  { label: "Account", path: "/account", icon: User },
];

const adminNav: NavItem[] = [
  { label: "Overview", path: "/admin/overview", icon: ChartBar },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Servers", path: "/admin/servers", icon: DesktopTower },
  { label: "Nodes", path: "/admin/nodes", icon: HardDrives },
  { label: "Images", path: "/admin/images", icon: Image },
  { label: "Addons", path: "/admin/addons", icon: PuzzlePiece },
  { label: "Settings", path: "/admin/settings", icon: Gear },
  { label: "Analytics", path: "/admin/analytics", icon: TrendUp },
  { label: "Security", path: "/admin/security", icon: Shield },
  { label: "API Keys", path: "/admin/api-keys", icon: Key },
  { label: "Player Stats", path: "/admin/playerstats", icon: ChartLineUp },
  { label: "Airlink Cloud", path: "/admin/airlink-cloud", icon: Cloud },
];

function SidebarNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
          isActive
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-neutral-100 dark:bg-white/5"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}
          <Icon
            weight={item.weight ?? "regular"}
            className="relative size-5 shrink-0"
          />
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {}
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "hidden md:flex fixed inset-y-0 left-0 w-56 flex-col z-50",
        "bg-white dark:bg-neutral-950 border-r border-neutral-200/30 dark:border-white/[0.07]"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-neutral-200/30 dark:border-white/[0.07]">
        <span className="text-lg font-bold tracking-tight font-display text-neutral-900 dark:text-white">
          Airlink
        </span>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-4 border-b border-neutral-200/30 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-sm font-semibold text-neutral-600 dark:text-neutral-300 shrink-0">
              {user.username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                {user.username}
                <span className="text-neutral-400 dark:text-neutral-500 font-normal">
                  #0001
                </span>
              </p>
              {user.description && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                  {user.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {regularNav.map((item) => (
          <SidebarNavItem key={item.path} item={item} />
        ))}

        {user?.isAdmin && adminNav.length > 0 && (
          <>
            <div className="pt-4 pb-2 px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Admin
              </p>
            </div>
            {adminNav.map((item) => (
              <SidebarNavItem key={item.path} item={item} />
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-neutral-200/30 dark:border-white/[0.07]">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium w-full",
            "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200"
          )}
        >
          <SignOut className="size-5 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
