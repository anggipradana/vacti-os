'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetches the server-rendered scan detail every 2s until the scan reaches a terminal state. */
export default function AutoRefresh({ terminal }: { terminal: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [terminal, router]);
  return null;
}
