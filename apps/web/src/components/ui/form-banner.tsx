import { CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * Inline success/error banner driven by `?ok=...` / `?error=...` search params. Server actions
 * redirect back with one of these codes; the page passes the code here to surface the result
 * (forms previously failed silently: the action redirected but nothing told the user why).
 *
 * `messages` maps a code to human text; an unknown code falls back to `fallback`.
 */
export function FormBanner({
  ok,
  error,
  messages,
  fallback = 'Something went wrong. Please check the form and try again.',
}: {
  ok?: string;
  error?: string;
  messages: Record<string, string>;
  fallback?: string;
}) {
  if (!ok && !error) return null;
  const isError = Boolean(error);
  const code = (error ?? ok)!;
  const text = messages[code] ?? (isError ? fallback : 'Saved.');
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger'
          : 'mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
