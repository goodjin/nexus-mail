import * as React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "primary" | "secondary";
}

function Badge({ className, variant = "primary", ...props }: BadgeProps) {
  const variants = {
    primary: "bg-nexus-primary text-nexus-primary-foreground",
    secondary: "bg-nexus-border text-nexus-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-nexus-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
