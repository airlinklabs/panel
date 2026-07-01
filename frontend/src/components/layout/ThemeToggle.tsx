import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();

  return (
    <button
      role="switch"
      aria-checked={theme === "dark"}
      aria-label="Toggle theme"
      onClick={toggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-500",
        "border border-neutral-200 dark:border-white/10",
        theme === "dark" ? "bg-neutral-700" : "bg-neutral-200",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-neutral-900 dark:bg-white shadow-sm transition-transform duration-500",
          theme === "dark" ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
