'use client';

import Link from 'next/link';

/**
 * Read-only summary. The sister's share is never taken automatically — it's
 * added from an individual invoice's page — so there's nothing to configure here.
 */
export function SisterCard({ month, year, money }: { month: number; year: number; money: (n: number) => string }) {
  return (
    <div className="card">
      <div className="df-panel-head">
        <span>Given to sister</span>
        <Link href="/daily-finance/investments" className="link-btn" style={{ fontSize: 12 }}>Investments log →</Link>
      </div>
      <div style={{ padding: '14px 16px 12px', fontSize: 12.5, display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">This month</span><b>{money(month)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">This year</span><b>{money(year)}</b></div>
        <p className="text-muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          Added invoice by invoice, from the &ldquo;Sister&rsquo;s share&rdquo; box on an invoice page.
        </p>
      </div>
    </div>
  );
}
