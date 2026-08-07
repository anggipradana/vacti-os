import * as React from 'react';
import { cn } from '../../lib/cn';

/**
 * Styled checkbox: a native input (keeps label/form semantics and indeterminate-free behaviour)
 * with the design-system accent + a visible focus-visible ring. Use instead of a raw
 * `<input type="checkbox">` so multi-select controls are keyboard-discoverable and on-brand.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'size-4 shrink-0 cursor-pointer rounded border-border-strong text-accent accent-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
