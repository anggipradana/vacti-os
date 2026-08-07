import { redirect } from 'next/navigation';

// The standalone Reports hub has been retired: report generation now lives inside each module
// (VA on /scans, CTI on /threat). This redirect keeps old /reports links and the command palette
// resolving. The report renderer routes under /reports/{va,ti} are unaffected - they generate the
// actual PDFs and remain linked from those modules.
export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  redirect('/scans');
}
