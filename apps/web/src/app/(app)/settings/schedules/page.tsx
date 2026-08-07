import { redirect } from 'next/navigation';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/card';
import { FormBanner } from '../../../../components/ui/form-banner';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Select } from '../../../../components/ui/select';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { userCan, Permission } from '@vacti/core';
import { targets, scanProfiles, scanSchedules, projects } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import {
  createScheduleAction,
  editScheduleAction,
  toggleScheduleAction,
  deleteScheduleAction,
} from '../../../../lib/recon-actions';
import { ProjectSwitcher } from '../../../../components/project-switcher';
import { getActiveProjectId } from '../../../../lib/active-project';
import { tenantScope, scopeWhere, scopeWhereOrGlobal } from '../../../../lib/tenancy';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const canManage = userCan(user, Permission.InitiateScans);
  const db = getDb();
  const t = await tenantScope(user);
  const projectRows = await db
    .select()
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));
  const sp = await searchParams;
  const projectId = await getActiveProjectId(sp.project, projectRows);
  // Schedules have no projectId of their own, so scope them via the active project's targets with an
  // inner join - only this project's schedules are fetched (no load-all + JS filter), and the join also
  // gives us each schedule's target domain for display.
  const [targetRows, profileRows, scheduleJoinRows] = await Promise.all([
    projectId
      ? db.select().from(targets).where(eq(targets.projectId, projectId)).orderBy(desc(targets.createdAt))
      : Promise.resolve([]),
    db.select().from(scanProfiles).where(scopeWhereOrGlobal(t, scanProfiles.projectId)),
    projectId
      ? db
          .select({ ...getTableColumns(scanSchedules), domain: targets.domain })
          .from(scanSchedules)
          .innerJoin(targets, eq(scanSchedules.targetId, targets.id))
          .where(eq(targets.projectId, projectId))
          .orderBy(desc(scanSchedules.createdAt))
      : Promise.resolve([]),
  ]);
  const scheduleRows = scheduleJoinRows;

  return (
    <>
      <FormBanner
        ok={sp.ok}
        error={sp.error}
        messages={{
          invalid: tx(
            locale,
            'Pick a target and a valid frequency before adding a schedule.',
            'Pilih target dan frekuensi yang valid sebelum menambah jadwal.',
          ),
        }}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {tx(
            locale,
            'Recurring scans via a lightweight cron tick. Times are WIB (Asia/Jakarta).',
            'Scan berulang via cron tick ringan. Waktu memakai WIB (Asia/Jakarta).',
          )}
        </p>
        <ProjectSwitcher projects={projectRows} current={projectId} basePath="/settings/schedules" />
      </div>

      {canManage ? (
        <Card className="mb-6">
          <CardContent className="pt-5">
            <form action={createScheduleAction} className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-1">
                <Label htmlFor="targetId">{tx(locale, 'Target', 'Target')}</Label>
                <Select id="targetId" name="targetId" required>
                  {targetRows.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.domain}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="profileId">{tx(locale, 'Profile', 'Profile')}</Label>
                <Select id="profileId" name="profileId">
                  <option value="">{tx(locale, 'Default', 'Default')}</option>
                  {profileRows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="freq">{tx(locale, 'Frequency', 'Frekuensi')}</Label>
                <Select id="freq" name="freq" defaultValue="daily">
                  <option value="hourly">{tx(locale, 'Hourly', 'Per jam')}</option>
                  <option value="daily">{tx(locale, 'Daily', 'Harian')}</option>
                  <option value="weekly">{tx(locale, 'Weekly', 'Mingguan')}</option>
                  <option value="monthly">{tx(locale, 'Monthly', 'Bulanan')}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="time">{tx(locale, 'Time', 'Waktu')}</Label>
                <Input id="time" name="time" type="time" defaultValue="02:00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dow">{tx(locale, 'Day (weekly)', 'Hari (mingguan)')}</Label>
                <Select id="dow" name="dow" defaultValue="1">
                  {[
                    tx(locale, 'Sunday', 'Minggu'),
                    tx(locale, 'Monday', 'Senin'),
                    tx(locale, 'Tuesday', 'Selasa'),
                    tx(locale, 'Wednesday', 'Rabu'),
                    tx(locale, 'Thursday', 'Kamis'),
                    tx(locale, 'Friday', 'Jumat'),
                    tx(locale, 'Saturday', 'Sabtu'),
                  ].map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dom">{tx(locale, 'Date (monthly)', 'Tanggal (bulanan)')}</Label>
                <Select id="dom" name="dom" defaultValue="1">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <SubmitButton pendingText={tx(locale, 'Adding…', 'Menambah…')} className="lg:col-span-6">
                {tx(locale, 'Add schedule', 'Tambah jadwal')}
              </SubmitButton>
            </form>
            <p className="mt-2 text-xs text-fg-subtle">
              {tx(
                locale,
                'Pick a frequency and time. Day applies to Weekly; Date applies to Monthly. Times are WIB (Asia/Jakarta).',
                'Pilih frekuensi dan waktu. Hari berlaku untuk Mingguan; Tanggal berlaku untuk Bulanan. Waktu memakai WIB (Asia/Jakarta).',
              )}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {scheduleRows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title={tx(locale, 'No schedules', 'Belum ada jadwal')}
          description={tx(locale, 'Add a recurring scan above.', 'Tambahkan scan berulang di atas.')}
        />
      ) : (
        <div className="space-y-2">
          {scheduleRows.map((s) => (
            <Card key={s.id} data-testid="schedule-row">
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-sm">{s.domain ?? s.targetId.slice(0, 8)}</span>
                    <span className="ml-3 font-mono text-xs text-fg-muted">{s.cron}</span>
                    {s.lastRunAt ? (
                      <span className="ml-3 text-xs text-fg-subtle">
                        {tx(locale, 'last run', 'terakhir jalan')}{' '}
                        {new Date(s.lastRunAt).toISOString().slice(0, 16).replace('T', ' ')}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.enabled ? 'accent' : 'neutral'}>
                      {s.enabled ? tx(locale, 'enabled', 'aktif') : tx(locale, 'paused', 'dijeda')}
                    </Badge>
                    {canManage ? (
                      <>
                        <form action={toggleScheduleAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="outline" size="sm">
                            {s.enabled ? tx(locale, 'Pause', 'Jeda') : tx(locale, 'Enable', 'Aktifkan')}
                          </SubmitButton>
                        </form>
                        <form action={deleteScheduleAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton
                            confirm={tx(locale, 'Delete this schedule?', 'Hapus jadwal ini?')}
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10"
                          >
                            {tx(locale, 'Delete', 'Hapus')}
                          </ConfirmButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
                      {tx(locale, 'Edit', 'Ubah')}
                    </summary>
                    <form action={editScheduleAction} className="mt-3 grid items-end gap-3 sm:grid-cols-3">
                      <input type="hidden" name="id" value={s.id} />
                      <div className="space-y-1">
                        <Label htmlFor={`cron-${s.id}`}>{tx(locale, 'Cron (5-field)', 'Cron (5-field)')}</Label>
                        <Input id={`cron-${s.id}`} name="cron" defaultValue={s.cron} className="font-mono" required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`profileId-${s.id}`}>{tx(locale, 'Profile', 'Profile')}</Label>
                        <Select id={`profileId-${s.id}`} name="profileId" defaultValue={s.profileId ?? ''}>
                          <option value="">{tx(locale, 'Default', 'Default')}</option>
                          {profileRows.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`enabled-${s.id}`}>{tx(locale, 'Status', 'Status')}</Label>
                        <Select id={`enabled-${s.id}`} name="enabled" defaultValue={s.enabled ? '1' : '0'}>
                          <option value="1">{tx(locale, 'Enabled', 'Aktif')}</option>
                          <option value="0">{tx(locale, 'Paused', 'Dijeda')}</option>
                        </Select>
                      </div>
                      <SubmitButton
                        size="sm"
                        pendingText={tx(locale, 'Saving…', 'Menyimpan…')}
                        className="sm:col-span-3"
                      >
                        {tx(locale, 'Save changes', 'Simpan perubahan')}
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
