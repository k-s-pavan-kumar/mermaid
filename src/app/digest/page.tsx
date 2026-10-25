import { redirect } from 'next/navigation';
import { getSessionEmail, getSessionDisplayName } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { table } from '@/lib/data';
import { todayIso, shiftIso } from '@/lib/tz/today';
import type { FinanceEntry } from '@/features/daily-finance/types';
import { getInvoicePaidTotals } from '@/features/billing/queries';
import { invoiceMoney, type Invoice } from '@/features/billing/types';
import type { Audit } from '@/features/audits/types';
import type { Product } from '@/features/products/types';
import { loadTargetData } from '@/features/targets/queries';
import { fieldView } from '@/features/targets/view';
import { digestText } from '@/features/targets/digest';
import { AgingPanel } from '@/features/targets/components/AgingPanel';
import { CopyButton } from '@/features/targets/components/CopyButton';
import { inr0 } from '@/features/targets/components/charts';
import { datedEvents } from '@/features/calendar/dates';

/** Monday of the week containing `iso`. */
function weekStartOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return shiftIso(iso, -((d.getDay() + 6) % 7));
}

/** The week at a glance: what came in, how the targets stand, who to chase, what is coming up. Copyable as plain text. */
export default async function DigestPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const from = weekStartOf(today);
  const to = shiftIso(from, 6);

  const [data, income, invoices, paid, clients, sender] = await Promise.all([
    loadTargetData(email, year),
    table<FinanceEntry>('finance_entries').where((e) => e.owner_id === email && e.type === 'income' && e.date >= from && e.date <= to && (e.source === 'invoice_payment' || e.source === 'bounty_payout')),
    table<Invoice>('invoices').where((i) => i.owner_id === email),
    getInvoicePaidTotals(email),
    table<{ id: string; owner_id: string; name: string }>('clients').where((c) => c.owner_id === email),
    getSessionDisplayName(),
  ]);
  let audits: Audit[] = [], products: Product[] = [];
  try { audits = await table<Audit>('audits').where((a) => a.owner_id === email); } catch { /* not migrated */ }
  try { products = await table<Product>('products').where((p) => p.owner_id === email); } catch { /* not migrated */ }

  const invById = new Map(invoices.map((i) => [i.id, i]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const payments = income.map((e) => {
    const inv = e.linked_invoice_id ? invById.get(e.linked_invoice_id) : undefined;
    const who = inv?.client_id ? clientName.get(inv.client_id) : undefined;
    return { label: inv ? `${inv.number}${who ? ` · ${who}` : ''}` : e.source === 'bounty_payout' ? 'Bug bounty payout' : 'Payment', amount: e.amount };
  });
  const receivedThisWeek = Math.round(income.reduce((a, e) => a + e.amount, 0) * 100) / 100;

  const fieldRows = data.fields.map((f) => {
    const v = fieldView(f.id, data, year, today);
    return { name: f.name, target: v.target, reached: v.summary.reached, pct: v.summary.pct, onPace: v.forecast && v.forecast.basis === 'run-rate' ? v.forecast.onPace : null, toBill: v.forecast?.toBill ?? 0 };
  });
  const chasing = data.receivables.filter((r) => r.daysLate > 0).sort((a, b) => b.daysLate - a.daysLate);

  const upcoming = datedEvents({
    from: today, to: shiftIso(today, 14), audits, products,
    openInvoices: invoices.map((i) => ({ id: i.id, number: i.number, due_at: i.due_at ?? null, owed: invoiceMoney(i, paid.get(i.id) ?? 0).outstanding, who: (i.client_id && clientName.get(i.client_id)) || '' })),
  });

  const weekLabel = `week of ${new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  const text = digestText({
    weekLabel, receivedThisWeek, payments, fields: fieldRows,
    chasing: chasing.map((r) => ({ number: r.number, who: r.who, owed: r.owed, daysLate: r.daysLate })),
    comingUp: upcoming.map((e) => `${e.date.slice(5)} — ${e.label}`),
  });

  return (
    <Shell active="digest" title="Weekly digest" crumb="Workspace"
      action={<CopyButton text={text} label="Copy as text" done="Digest copied" className="btn-inline" />}>
      <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>{weekLabel} · what to look at on Monday. &ldquo;Copy as text&rdquo; gives you a version to paste into WhatsApp, email or notes.</p>

      <div className="stat-row">
        <div className="stat-box"><div className="lbl">Received this week</div><div className="val" style={{ color: 'var(--sage)' }}>{inr0(receivedThisWeek)}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{payments.length} payment{payments.length === 1 ? '' : 's'}</div></div>
        <div className="stat-box"><div className="lbl">Overdue</div><div className="val" style={{ color: chasing.length ? 'var(--crimson)' : undefined }}>{inr0(chasing.reduce((a, r) => a + r.owed, 0))}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{chasing.length} invoice{chasing.length === 1 ? '' : 's'}</div></div>
        <div className="stat-box"><div className="lbl">Still to bill</div><div className="val">{inr0(fieldRows.reduce((a, f) => a + f.toBill, 0))}</div><div className="text-muted" style={{ fontSize: 11.5 }}>to reach your goals</div></div>
      </div>

      {payments.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Came in this week</h3>
          {payments.map((p, i) => <div key={i} className="list-row"><span>{p.label}</span><strong className="mono">{inr0(p.amount)}</strong></div>)}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Yearly targets</h3>
        {fieldRows.filter((f) => f.target > 0).length === 0 && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No yearly goals set yet — set them under Goals.</p>}
        {fieldRows.filter((f) => f.target > 0).map((f) => (
          <div key={f.name} className="list-row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{f.name}</span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5 }}>
              <span>{inr0(f.reached)} of {inr0(f.target)} · {f.pct}%</span>
              {f.onPace !== null && <span style={{ color: f.onPace ? 'var(--sage)' : 'var(--crimson)' }}>{f.onPace ? 'on pace' : 'behind pace'}</span>}
              {f.toBill > 0 && <span className="text-muted">still to bill {inr0(f.toBill)}</span>}
            </span>
          </div>
        ))}
      </div>

      <AgingPanel receivables={chasing} title="Chase these" sender={sender ?? undefined} fieldNames={new Map(data.fields.map((f) => [f.id, f.name]))} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Coming up · next 14 days</h3>
        {upcoming.length === 0 && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No audits, launches or invoices falling due.</p>}
        {upcoming.map((e, i) => <div key={i} className="list-row"><a href={e.href} style={{ textDecoration: 'none' }}>{e.label}</a><span className="text-muted" style={{ fontSize: 12.5 }}>{e.date}</span></div>)}
      </div>
    </Shell>
  );
}
