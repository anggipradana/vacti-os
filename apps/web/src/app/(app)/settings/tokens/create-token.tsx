'use client';

import { useActionState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { createTokenAction } from '../../../../lib/actions';
import { Card, CardContent } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Button } from '../../../../components/ui/button';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { tx, type Locale } from '../../../../lib/i18n';

export default function CreateToken({ locale = 'en' }: { locale?: Locale }) {
  const [state, formAction] = useActionState(createTokenAction, {} as { token?: string });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state?.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      setCopied(true);
      toast.success(tx(locale, 'Token copied to clipboard', 'Token disalin ke clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tx(locale, 'Copy failed - select and copy manually', 'Salin gagal - pilih dan salin manual'));
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <form action={formAction} className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="label">{tx(locale, 'Label', 'Label')}</Label>
            <Input id="label" name="label" data-testid="token-label" placeholder="ci-automation" />
          </div>
          <SubmitButton data-testid="create-token" pendingText={tx(locale, 'Creating…', 'Membuat…')}>
            {tx(locale, 'Create token', 'Buat token')}
          </SubmitButton>
        </form>
        {state?.token ? (
          <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 p-3">
            <p className="mb-1 text-xs font-medium text-accent">
              {tx(locale, 'Copy now - shown once', 'Salin sekarang - hanya ditampilkan sekali')}
            </p>
            <div className="flex items-center gap-2">
              <code data-testid="new-token" className="flex-1 break-all font-mono text-xs">
                {state.token}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={copy}
                aria-label={tx(locale, 'Copy token to clipboard', 'Salin token ke clipboard')}
                title={tx(locale, 'Copy token', 'Salin token')}
              >
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
