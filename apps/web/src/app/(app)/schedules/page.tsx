import { redirect } from 'next/navigation';

// Schedules moved into Settings; keep the old URL working for bookmarks and stale links.
export default function SchedulesRedirect() {
  redirect('/settings/schedules');
}
