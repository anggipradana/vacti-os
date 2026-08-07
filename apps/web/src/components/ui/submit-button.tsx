'use client';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';

/**
 * A submit button that reflects the enclosing <form>'s pending state (server actions).
 * Shows a spinner + optional `pendingText` and disables itself while the action runs.
 */
export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
