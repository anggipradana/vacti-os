import 'server-only';
import { auditLog } from '@vacti/db';
import { getDb } from './db';

/**
 * Record an audit entry for a mutating action. Best-effort: never throws into the caller
 * (audit failures must not break the user action). Do not put secrets in `metadata`.
 */
export async function recordAudit(entry: {
  actorId: string;
  action: string;
  resource: string;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        projectId: entry.projectId ?? null,
        metadata: entry.metadata ?? null,
      });
  } catch (err) {
    console.error('[audit] failed to record', entry.action, err);
  }
}
