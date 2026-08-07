import { Permission, roleFromUser } from '@vacti/core';
import { requirePermission } from '../../../lib/authz';
import { getQuotaState } from '../../../lib/leaks-service';
import { listCasesForUser } from '../../../lib/leaks-actions';
import { LeaksTabs, type CaseCard } from './leaks-tabs';

export const dynamic = 'force-dynamic';

/**
 * Top-level Leaks tool. Server-side RBAC: only Penetration Tester/SysAdmin (InitiateScans) reach it; Auditor is
 * forbidden by requirePermission. Fetches the initial quota chip + the caller's saved Cases, then hands
 * off to the client island for the Search/Cases tabs. White-labeled: no provider field is ever exposed.
 */
export default async function LeaksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission(Permission.InitiateScans);
  const role = roleFromUser(user);
  const [quota, cases] = await Promise.all([getQuotaState(user.id, role), listCasesForUser(user.id, role)]);
  const { tab } = await searchParams;

  const caseCards: CaseCard[] = cases.map((c) => ({
    id: c.id,
    name: c.name,
    query: c.query,
    resultCount: c.resultCount,
    sourceCount: c.sourceCount,
    updatedAt: c.updatedAt.toISOString(),
    tags: c.tags ?? [],
  }));

  return <LeaksTabs initialTab={tab === 'cases' ? 'cases' : 'search'} initialQuota={quota} cases={caseCards} />;
}
