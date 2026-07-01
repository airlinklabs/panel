import { NavLink } from "react-router-dom";
import {
  Terminal,
  Folder,
  UsersThree,
  Globe,
  ClockCounterClockwise,
  Gear,
  Lightning,
  Key,
  BellRinging,
  CalendarCheck,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface TabItem {
  label: string;
  path: string;
  icon: typeof Terminal;
}

const tabs: TabItem[] = [
  { label: "Console", path: "", icon: Terminal },
  { label: "Files", path: "files", icon: Folder },
  { label: "Players", path: "players", icon: UsersThree },
  { label: "Worlds", path: "worlds", icon: Globe },
  { label: "Backups", path: "backups", icon: ClockCounterClockwise },
  { label: "Settings", path: "settings", icon: Gear },
  { label: "Startup", path: "startup", icon: Lightning },
  { label: "Access", path: "access", icon: Key },
  { label: "Alerts", path: "alerts", icon: BellRinging },
  { label: "Tasks", path: "tasks", icon: CalendarCheck },
];

export function ServerSubNav({
  basePath,
  className,
}: {
  basePath: string;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto scrollbar-none pb-1",
        className
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const to = tab.path ? `${basePath}/${tab.path}` : basePath;

        return (
          <NavLink
            key={tab.path}
            to={to}
            end={tab.path === ""}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200",
                isActive
                  ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
