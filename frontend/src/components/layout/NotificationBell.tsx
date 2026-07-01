import { useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  message: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell({ className }: { className?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    fetch("/api/notifications", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.data)) setNotifications(data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center size-4 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-neutral-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden z-50",
              "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10",
              "shadow-xl shadow-neutral-900/10 dark:shadow-black/30"
            )}
          >
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-white/10">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                Notifications
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-neutral-400">
                  No notifications yet.
                </div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-4 py-3 border-b border-neutral-100 dark:border-white/5 last:border-0",
                    !n.read && "bg-neutral-50 dark:bg-white/[0.02]"
                  )}
                >
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {n.message}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
