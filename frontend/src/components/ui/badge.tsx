import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = {
  default:
    "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white",
  success:
    "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  warning:
    "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400",
  danger:
    "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400",
  info:
    "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400",
  neutral:
    "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          badgeVariants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
