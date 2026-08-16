'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import styles from './print.module.css';

/** Screen-only controls. Hidden by @media print so they never reach the page. */
export default function PrintButton() {
  const { planId } = useParams<{ planId: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${planId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not generate the PDF');
      }
      const blob = await res.blob();
      const name =
        res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ?? 'itinerary.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.controls}>
      <Link href={`/itinerary/${planId}`} className={styles.back}>
        ← Back to map
      </Link>
      <button type="button" className={styles.printBtn} onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download PDF'}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
