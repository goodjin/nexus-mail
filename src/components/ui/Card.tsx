import * as React from "react";
import { cn } from "../../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, selected, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-nexus border border-nexus-border bg-nexus-background p-4 shadow-sm transition-all hover:border-nexus-primary/30",
        selected && "border-nexus-primary ring-1 ring-nexus-primary bg-nexus-selection",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card };
