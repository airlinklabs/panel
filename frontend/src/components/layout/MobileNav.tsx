import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  House,
  PlusSquare,
  User,
  DotsThree,
  SignOut,
  ChartBar,
  Users,
  DesktopTower,
  HardDrives,
  Gear,
  TrendUp,
  Shield,
  Key,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  label: string;
  path: string;
  icon: typeof House;
}

const mainNav: NavItem[] = [
  { label: "Home", path: "/", icon: House },
  { label: "Create", path: "/create-server", icon: PlusSquare },
  { label: "Account", path: "/account", icon: User },
];

const overflowNav: NavItem[] = [
  { label: "Overview", path: "/admin/overview", icon: ChartBar },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Servers", path: "/admin/servers", icon: DesktopTower },
  { label: "Nodes", path: "/admin/nodes", icon: HardDrives },
  { label: "Settings", path: "/admin/settings", icon: Gear },
  { label: "Analytics", path: "/admin/analytics", icon: TrendUp },
  { label: "Security", path: "/admin/security", icon: Shield },
  { label: "API Keys", path: "/admin/api-keys", icon: Key },
];

export function MobileNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 h-16 z-50 flex items-center justify-around",
          "al-glass border-t border-neutral-200/30 dark:border-white/[0.07]"
        )}
      >
        {mainNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px]",
                  isActive
                    ? "text-neutral-900 dark:text-white bg-neutral-100 dark:bg-white/5"
                    : "text-neutral-400 dark:text-neutral-500"
                )
              }
            >
              <Icon className="size-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {user?.isAdmin && (
          <button
            onClick={() => setOverflowOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-neutral-400 dark:text-neutral-500 min-w-[56px]"
          >
            <DotsThree className="size-5" />
            <span className="text-[11px] font-medium">More</span>
          </button>
        )}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-red-400 dark:text-red-500 min-w-[56px]"
        >
          <SignOut className="size-5" />
          <span className="text-[11px] font-medium">Logout</span>
        </button>
      </nav>

      {/* Bottom sheet */}
      <AnimatePresence>
        {overflowOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-sm md:hidden"
              onClick={() => setOverflowOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={cn(
                "fixed bottom-0 inset-x-0 z-50 md:hidden",
                "bg-white dark:bg-neutral-900 rounded-t-2xl border-t border-neutral-200/30 dark:border-white/[0.07]",
                "shadow-2xl shadow-neutral-900/20 dark:shadow-black/40"
              )}
            >
              <div className="flex justify-center py-3">
                <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              </div>
              <div className="px-4 pb-8 max-h-[60vh] overflow-y-auto">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 pb-2">
                  Navigation
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {overflowNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setOverflowOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                            isActive
                              ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white"
                              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
                          )
                        }
                      >
                        <Icon className="size-5" />
                        <span className="text-[11px] font-medium text-center leading-tight">
                          {item.label}
                        </span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
