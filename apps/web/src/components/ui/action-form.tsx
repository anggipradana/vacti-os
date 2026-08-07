'use client';

import * as React from 'react';
import { Button, type ButtonProps } from './button';

/**
 * A form that runs a server action and then reloads to show the result. On the heavy pages the
 * production client both (a) hangs useFormStatus forever (the action's response is dropped) and
 * (b) fails to re-apply the route flight via router.refresh() or a same-route client nav. So we
 * drive a local pending state, fire the action once (the request reaches the server and persists
 * even when the client drops the response), then reload once it has persisted. Used by the heavy
 * pages (integrations, threat, surface); the lighter pages use the normal SubmitButton + revalidate.
 */
const PendingContext = React.createContext(false);

export function ActionForm({
  action,
  children,
  onSubmitted,
  redirectTo,
  confirm,
  ...props
}: {
  action: (formData: FormData) => void | Promise<void>;
  onSubmitted?: () => void;
  /** When set, navigate here after the action persists (full load) instead of reloading in place. */
  redirectTo?: string;
  /** When set, ask for confirmation (window.confirm) before running - for destructive actions. */
  confirm?: string;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'action'>) {
  const [pending, setPending] = React.useState(false);

  // Why this isn't a plain <form action={...}> + useFormStatus: in the production build the heavy
  // pages drop the action's (large) response, so useFormStatus hangs forever and router.refresh()
  // will not re-apply the flight. We fire the action ONCE (safe for non-idempotent inserts) and
  // AWAIT it (capped) before reloading - awaiting matters because reloading mid-upload would abort
  // the POST before the server receives it. The server still processes the request and persists even
  // when the client drops the response, so a reload then renders the result.
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        setPending(true);
        void (async () => {
          await Promise.race([
            Promise.resolve()
              .then(() => action(fd))
              .catch(() => {}),
            new Promise((r) => setTimeout(r, 4000)),
          ]);
          // Grace for the server to finish persisting if the client dropped the response early.
          await new Promise((r) => setTimeout(r, 400));
          onSubmitted?.();
          // NOTE: router.refresh()'s RSC fetch is itself dropped on these heavy pages (same connection
          // quirk that drops the action response), so a soft refresh leaves stale UI. A full reload is
          // currently the only reliable way to render the persisted result here.
          if (redirectTo) window.location.assign(redirectTo);
          else window.location.reload();
        })();
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

/** Submit button for ActionForm: reflects the transition's pending state (spinner + disabled). */
export function ActionSubmit({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const pending = React.useContext(PendingContext);
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
