import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse bg-neutral-200 dark:bg-neutral-800 rounded-xl",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
