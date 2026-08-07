'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from './input';

/**
 * An <Input> that submits its enclosing <form> on blur and on Enter - the inline-edit twin of
 * AutoSubmitSelect (no separate "Save" button to forget). Use inside a `<form action={serverAction}>`;
 * shows a subtle busy state while the action runs. Enter submits without inserting a newline.
 */
export function AutoSubmitInput({ onBlur, onKeyDown, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const { pending } = useFormStatus();
  return (
    <Input
      {...props}
      disabled={pending || props.disabled}
      onBlur={(e) => {
        onBlur?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
