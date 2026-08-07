'use client';
import { useState } from 'react';

/** Masked value with a click-to-reveal toggle (for leaked passwords and other sensitive cells). */
export function Reveal({ value }: { value?: string | null }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-fg-subtle">-</span>;
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      title={shown ? 'Click to hide' : 'Click to reveal'}
      className="font-mono text-xs text-accent hover:underline"
    >
      {shown ? value : '•••••• show'}
    </button>
  );
}
