import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { SearchDialog } from "./SearchDialog";

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

      <div
        id="colcont"
        className="lg:pl-56"
      >
        <div
          className={cn(
            "al-topbar fixed top-0 left-0 lg:left-56 right-0 z-10 flex h-16 shrink-0 items-center gap-x-4",
            "bg-white/90 dark:bg-neutral-900/80 border-b border-neutral-200/60 dark:border-white/5",
            "px-4 sm:gap-x-6 sm:px-4 lg:px-4"
          )}
        >
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="relative flex flex-1 flex-col">
              <div
                className="al-search-shell lg:-ml-2 flex items-center w-fit mt-3.5 px-4 py-2 h-10 rounded-xl border border-neutral-300 dark:border-white/5 active:scale-100 duration-200 hover:border-neutral-400 dark:hover:border-neutral-300/10 bg-transparent text-neutral-800 dark:text-white"
                role="search"
              >
                <MagnifyingGlass className="h-5 w-5 text-neutral-400" />
                <input
                  className="bg-transparent border-transparent ml-2 focus-visible:ring-transparent border-none ring-transparent sm:text-sm placeholder:text-zinc-500 text-neutral-700 dark:text-neutral-300 focus-visible:outline-none"
                  placeholder="Search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="false"
                  aria-controls="searchResults"
                  aria-activedescendant=""
                  aria-label="Search"
                  name="search"
                  autoComplete="off"
                  onFocus={() => {}}
                />
                <div
                  aria-hidden="true"
                  className="ml-2 px-1 py-0.5 text-[10px] w-[55px] font-medium text-neutral-700 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-800 rounded-md border border-neutral-300 dark:border-neutral-700 bg-[linear-gradient(45deg,transparent_25%,rgba(68,68,68,.2)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] bg-[position:-100%_0,0_0] bg-no-repeat transition-ease-out hover:bg-[position:200%_0,0_0] hover:duration-[2s]"
                >
                  CTRL + K
                </div>
              </div>

              <div
                id="searchResults"
                role="listbox"
                aria-label="Search results"
                className="hidden absolute left-0 top-full mt-2 w-[19.5rem] rounded-xl px-2 pb-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 shadow-lg"
                style={{ zIndex: "var(--z-dropdown)" }}
              />
            </div>
          </div>
          <button
            role="switch"
            aria-checked="false"
            className="al-switch relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-500 bg-neutral-300 dark:bg-neutral-700/70 border border-neutral-400 dark:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900 shrink-0"
            aria-label="Switch to dark mode"
          >
            <span className="al-switch-dot inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-500 border border-neutral-950/20" />
          </button>
        </div>
      </div>
    </>
  );
}
