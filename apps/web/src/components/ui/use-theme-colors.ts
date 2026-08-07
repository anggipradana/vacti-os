'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/** Resolve CSS custom-property colors to concrete hsl() strings (for SVG/Recharts), reactive to theme. */
export function useThemeColors(names: string[]): Record<string, string> {
  const { resolvedTheme } = useTheme();
  const key = names.join(',');
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of names) out[n] = `hsl(${cs.getPropertyValue(`--${n}`).trim()})`;
    setColors(out);
  }, [resolvedTheme, key]);
  return colors;
}
