import { useEffect, useState } from "react";
import { List } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { SearchDialog } from "./SearchDialog";
import { NotificationBell } from "./NotificationBell";

interface TopbarProps {
  onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 0);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <>
      <SearchDialog />

      {/* Desktop topbar */}
      <header
        className={cn(
          "hidden md:flex fixed top-0 left-56 right-0 h-16 z-40 items-center justify-end gap-2 px-6",
          "al-glass border-b border-neutral-200/30 dark:border-white/[0.07] transition-shadow duration-300",
          scrolled && "shadow-sm"
        )}
      >
        <NotificationBell />
        <ThemeToggle />
      </header>

      {/* Mobile topbar */}
      <header
        className={cn(
          "md:hidden fixed top-0 inset-x-0 h-16 z-40 flex items-center justify-between px-4",
          "al-glass border-b border-neutral-200/30 dark:border-white/[0.07] transition-shadow duration-300",
          scrolled && "shadow-sm"
        )}
      >
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-xl text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
          aria-label="Toggle menu"
        >
          <List className="size-5" />
        </button>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
