import * as React from "react";
import { cn } from "@/lib/utils";

const statusConfig = {
  online: {
    dot: "bg-emerald-500",
    ping: "bg-emerald-400",
    badge: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  },
  starting: {
    dot: "bg-amber-500",
    ping: "bg-amber-400",
    badge: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400",
  },
  stopping: {
    dot: "bg-orange-500",
    ping: "bg-orange-400",
    badge: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400",
  },
  offline: {
    dot: "bg-red-500",
    ping: "bg-red-400",
    badge: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400",
  },
  error: {
    dot: "bg-red-500",
    ping: "bg-red-400",
    badge: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400",
  },
} as const;

export type StatusType = keyof typeof statusConfig;

export interface BadgeStatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType;
  showLabel?: boolean;
  label?: string;
}

const BadgeStatus = React.forwardRef<HTMLSpanElement, BadgeStatusProps>(
  ({ className, status, showLabel = true, label, ...props }, ref) => {
    const config = statusConfig[status];
    const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
          config.badge,
          className
        )}
        {...props}
      >
        <span className="relative flex h-2 w-2">
          {(status === "online" || status === "starting") && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                config.ping
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              config.dot
            )}
          />
        </span>
        {showLabel && displayLabel}
      </span>
    );
  }
);
BadgeStatus.displayName = "BadgeStatus";

export { BadgeStatus };
