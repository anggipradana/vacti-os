'use client';

import { Download, ChevronDown } from 'lucide-react';
import { tx, type Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';

/**
 * Consolidates the three Attack Surface exports (ZIP, URLs CSV, Findings CSV) into a single
 * dropdown so the page header stays tidy instead of wrapping a row of buttons.
 */
export function SurfaceExportMenu({ projectId, locale = 'en' }: { projectId: string; locale?: Locale }) {
  const base = `/surface/export?project=${projectId}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Download className="size-4" /> {tx(locale, 'Export', 'Ekspor')} <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`${base}&format=zip`} download>
            {tx(locale, 'Everything (ZIP)', 'Semua (ZIP)')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${base}&format=csv&resource=urls`} download>
            {tx(locale, 'Discovered URLs (CSV)', 'URL ditemukan (CSV)')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${base}&format=csv&resource=findings`} download>
            {tx(locale, 'Exposure findings (CSV)', 'Exposure findings (CSV)')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
