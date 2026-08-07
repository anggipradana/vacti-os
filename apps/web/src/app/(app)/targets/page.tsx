import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The standalone Targets page is retired: target management now lives inside Vulnerability
 * Assessment (/scans) and Cyber Threat Intel (/threat) via the shared <TargetsManager>. Old links
 * (and the legacy `?project=` query) redirect to /scans, where the Targets panel surfaces the same
 * CRUD. Per-target recon notes stay reachable at /targets/[id].
 */
export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  redirect(sp.project ? `/scans?project=${sp.project}` : '/scans');
}
