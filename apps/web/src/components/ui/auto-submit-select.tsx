'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Select } from './select';

/**
 * A status <Select> that submits its enclosing <form> immediately on change - no separate "Set"
 * button to forget (the #1 "changing status doesn't work" confusion). Use inside a
 * `<form action={serverAction}>`; shows a subtle busy state while the action runs.
 */
export function AutoSubmitSelect({ onChange, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { pending } = useFormStatus();
  return (
    <Select
      {...props}
      disabled={pending || props.disabled}
      className={props.className}
      onChange={(e) => {
        onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
