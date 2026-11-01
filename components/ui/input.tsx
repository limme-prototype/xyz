import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[var(--space-tap)] w-full rounded-md border border-[var(--ios-separator)] bg-transparent px-[var(--space-3)] py-1 text-body tracking-[var(--tracking-body)] shadow-none transition-colors file:border-0 file:bg-transparent file:text-body file:font-medium file:text-foreground placeholder:text-[var(--ios-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ios-blue)]/60 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
