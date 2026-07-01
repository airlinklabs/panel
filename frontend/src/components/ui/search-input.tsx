import * as React from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  shortcut?: string;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onClear, shortcut = "Ctrl+K", value, ...props }, ref) => {
    const [inputValue, setInputValue] = React.useState(value || "");

    React.useEffect(() => {
      if (value !== undefined) {
        setInputValue(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      props.onChange?.(e);
    };

    const handleClear = () => {
      setInputValue("");
      onClear?.();
    };

    return (
      <div className="relative w-full">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
        <input
          ref={ref}
          type="text"
          className={cn(
            "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-10 pr-20 py-3 text-sm",
            "text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
            "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={inputValue}
          onChange={handleChange}
          {...props}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {shortcut && (
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 px-1.5 font-mono text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              {shortcut}
            </kbd>
          )}
        </div>
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
