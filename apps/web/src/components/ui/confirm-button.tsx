'use client';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';

/**
 * Submit button that asks for confirmation before submitting its form. Use for destructive actions
 * (delete user/project/scan/finding). Pairs with a server action on the surrounding <form>. Once
 * confirmed, it reflects the form's pending state (spinner + disabled) so the click feels responsive.
 */
export function ConfirmButton({
  confirm = 'Are you sure? This cannot be undone.',
  children,
  ...props
}: ButtonProps & { confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
