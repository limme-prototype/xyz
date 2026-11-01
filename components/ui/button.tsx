import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "interactive inline-flex items-center justify-center gap-[var(--space-2)] whitespace-nowrap rounded-md text-body font-medium tracking-[var(--tracking-body)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ios-blue)]/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer";

    const variants = {
      default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
      destructive:
        "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
      outline:
        "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
      secondary:
        "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-[var(--space-tap)] px-[var(--space-4)]",
      sm: "h-8 rounded-[var(--radius-sm)] px-[var(--space-3)] text-footnote",
      lg: "h-[var(--space-tap)] px-[var(--space-6)]",
      icon: "size-9",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
