import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'border-border bg-surface-2 text-fg-muted',
      accent: 'border-accent/30 bg-accent/10 text-accent',
      success: 'border-success/30 bg-success/10 text-success',
      danger: 'border-danger/30 bg-danger/10 text-danger',
      outline: 'border-border-strong text-fg-muted',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
