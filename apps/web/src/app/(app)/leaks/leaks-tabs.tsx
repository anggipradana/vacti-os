'use client';

import * as React from 'react';
import { Search, FolderSearch } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import type { QuotaState } from '../../../lib/leaks-service';
import { SearchPanel } from './search-panel';
import { CasesList } from './cases-list';

export interface CaseCard {
  id: string;
  name: string;
  query: string;
  resultCount: number;
  sourceCount: number;
  updatedAt: string;
  tags: string[];
}

/** Quota chip: "N left today" (or "Unlimited" for SysAdmin). Lives in the page header, updated live after
 *  each search from the action's returned quota state. */
function QuotaChip({ quota }: { quota: QuotaState }) {
  if (quota.unlimited || quota.remainingToday == null) {
    return <Badge variant="success">Unlimited</Badge>;
  }
  const low = quota.remainingToday <= 0;
  return (
    <Badge variant={low ? 'danger' : 'neutral'}>
      {quota.remainingToday} left today
      {quota.dailyLimit != null ? ` / ${quota.dailyLimit}` : ''}
    </Badge>
  );
}

/**
 * Client orchestrator for the Leaks page: owns the live quota state (seeded server-side, refreshed by each
 * search) and renders the Search / Cases tabs. Kept a client island so the search results, password reveal
 * and quota chip can react without extra round-trips.
 */
export function LeaksTabs({
  initialTab,
  initialQuota,
  cases,
}: {
  initialTab: 'search' | 'cases';
  initialQuota: QuotaState;
  cases: CaseCard[];
}) {
  const [quota, setQuota] = React.useState<QuotaState>(initialQuota);

  return (
    <>
      <PageHeader
        title="Leaks"
        description="Search leaked credentials by email, domain, username, phone or name. Save findings as Cases."
        actions={<QuotaChip quota={quota} />}
      />

      <Tabs defaultValue={initialTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="search">
            <Search className="size-3.5" /> Search
          </TabsTrigger>
          <TabsTrigger value="cases">
            <FolderSearch className="size-3.5" /> Cases
            <Badge variant="neutral" className="ml-1">
              {cases.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <SearchPanel onQuota={setQuota} />
        </TabsContent>

        <TabsContent value="cases">
          <CasesList cases={cases} />
        </TabsContent>
      </Tabs>
    </>
  );
}
