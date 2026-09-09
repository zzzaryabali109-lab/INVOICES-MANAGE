import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-white/30 bg-primary text-primary-foreground shadow-neu-xs",
        secondary: "border-white/70 dark:border-white/10 bg-card text-secondary-foreground shadow-neu-xs",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-neu-xs",
        outline: "border-border/80 bg-card/60 text-foreground shadow-neu-inset-sm",
        neu: "border-white/70 dark:border-white/10 bg-card text-foreground shadow-neu-xs",
        "neu-inset": "border-black/5 dark:border-white/5 bg-card/70 text-foreground shadow-neu-inset-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
