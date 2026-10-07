import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getInvoices, getQuotes, getIncomeByStream, getInvoicePaidTotals } from '@/features/billing/queries';
import { createInvoiceAndOpen, createQuoteAndOpen, markInvoicePaid, convertQuoteAndOpen, deleteDoc } from '@/features/billing/actions';
import { grandTotal, STREAM_LABEL } from '@/features/billing/types';
import { getClients } from '@/features/clients/queries';
import { getProjects } from '@/features/projects/queries';
import { getSettings } from '@/features/settings/queries';
import { Shell } from '@/components/Shell';
import { ActionButton } from '@/components/ActionButton';
import { DocForm } from '@/features/billing/components/DocForm';

const money = (n: number, ccy = 'INR') =>
  (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const INVOICE_TAG: Record<string, string> = { paid: 'ontrack', overdue: 'risk', partial: 'review', pending: 'review', draft: 'idea' };
const QUOTE_TAG: Record<string, string> = { accepted: 'ontrack', declined: 'risk', sent: 'review', draft: 'idea' };

const PENDING_STATUSES = ['pending', 'partial', 'overdue'];
type StatusFilter = 'all' | 'pending' | 'paid';

const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : 'none');
const monthLabel = (ym: string, long = false) =>
  ym === 'none'
    ? 'No date'
    : new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ new?: string; month?: string; status?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { new: creating, month: monthParam, status: statusParam } = await searchParams;
  const statusFilter: StatusFilter = statusParam === 'pending' || statusParam === 'paid' ? statusParam : 'all';
  const [invoices, quotes, byStream, clients, projects, settings, paidTotals] = await Promise.all([
    getInvoices(email),
    getQuotes(email),
    getIncomeByStream(email),
    getClients(email),
    getProjects(),
    getSettings(email),
    getInvoicePaidTotals(email),
  ]);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;
  const payer = (d: { client_id: string | null; project_id: string | null }) =>
    clientName(d.client_id) ?? projectName(d.project_id) ?? '—';

  // Per-invoice money: what was billed and how much of it has actually come in.
  const money_of = (i: (typeof invoices)[number]) => {
    const t = grandTotal(i);
    const billed = i.status === 'draft' ? 0 : t;
    const collected = i.status === 'paid' || i.status === 'partial' ? Math.min(t, paidTotals.get(i.id) ?? 0) : 0;
    return { billed, collected, pending: billed - collected };
  };

  // Month buckets (by issue date), newest first.
  const buckets = new Map<string, { invoiced: number; collected: number; pending: number; count: number }>();
  for (const inv of invoices) {
    const k = monthKey(inv.issued_at);
    const b = buckets.get(k) ?? { invoiced: 0, collected: 0, pending: 0, count: 0 };
    const m = money_of(inv);
    b.invoiced += m.billed; b.collected += m.collected; b.pending += m.pending; b.count += 1;
    buckets.set(k, b);
  }
  const months = [...buckets.keys()].sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)));
  const selectedMonth = monthParam && buckets.has(monthParam) ? monthParam : 'all';

  const sum = (k: string) =>
    k === 'all'
      ? [...buckets.values()].reduce((a, b) => ({ invoiced: a.invoiced + b.invoiced, collected: a.collected + b.collected, pending: a.pending + b.pending, count: a.count + b.count }), { invoiced: 0, collected: 0, pending: 0, count: 0 })
      : buckets.get(k)!;
  const totals = sum(selectedMonth);
  const scopeLabel = selectedMonth === 'all' ? '' : ` · ${monthLabel(selectedMonth)}`;

  const href = (o: { month?: string; status?: StatusFilter }) => {
    const m = o.month ?? selectedMonth;
    const st = o.status ?? statusFilter;
    const q = new URLSearchParams();
    if (m !== 'all') q.set('month', m);
    if (st !== 'all') q.set('status', st);
    const qs = q.toString();
    return qs ? `/billing?${qs}` : '/billing';
  };

  // Rows after month + status filters, grouped by month for display.
  const visible = invoices.filter((i) => {
    if (selectedMonth !== 'all' && monthKey(i.issued_at) !== selectedMonth) return false;
    if (statusFilter === 'paid') return i.status === 'paid';
    if (statusFilter === 'pending') return PENDING_STATUSES.includes(i.status);
    return true;
  });
  const groups = months
    .map((k) => ({ key: k, rows: visible.filter((i) => monthKey(i.issued_at) === k) }))
    .filter((g) => g.rows.length > 0);

  return (
    <Shell active="billing" title="Billing" crumb="Workspace">
      <div className="stat-row three">
        <div className="stat-box"><div className="lbl">Invoiced{scopeLabel}</div><div className="val">{money(totals.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Collected{scopeLabel}</div><div className="val" style={{ color: 'var(--sage)' }}>{money(totals.collected)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding{scopeLabel}</div><div className="val" style={{ color: 'var(--crimson)' }}>{money(totals.pending)}</div></div>
      </div>

      {byStream.length > 0 && (
        <>
          <div className="section-title"><h3>Where the money comes from</h3></div>
          <div className="metric-row">
            {byStream.map((s) => (
              <div key={s.stream} className="metric-box">
                <div className="text-muted" style={{ fontSize: 11 }}>{STREAM_LABEL[s.stream] ?? s.stream}</div>
                <div style={{ fontSize: 19, fontFamily: "'Fraunces',serif" }}>{money(s.invoiced)}</div>
                <div style={{ fontSize: 11, color: s.outstanding > 0 ? 'var(--crimson)' : 'var(--sage)' }}>
                  {s.outstanding > 0 ? `${money(s.outstanding)} outstanding` : 'all collected'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {months.length > 0 && (
        <>
          <div className="section-title"><h3>Month by month</h3></div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
            <a
              href={href({ month: 'all' })}
              className="metric-box"
              style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 150px', borderColor: selectedMonth === 'all' ? 'var(--ink)' : undefined, borderWidth: selectedMonth === 'all' ? 2 : 1 }}
            >
              <div className="text-muted" style={{ fontSize: 11 }}>All months</div>
              <div style={{ fontSize: 17, fontFamily: "'Fraunces',serif" }}>{money(sum('all').invoiced)}</div>
              <div style={{ fontSize: 11, color: 'var(--sage)' }}>{money(sum('all').collected)} cleared</div>
              <div style={{ fontSize: 11, color: 'var(--crimson)' }}>{money(sum('all').pending)} pending</div>
            </a>
            {months.map((k) => {
              const b = buckets.get(k)!;
              const active = selectedMonth === k;
              return (
                <a
                  key={k}
                  href={href({ month: k })}
                  className="metric-box"
                  style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 150px', borderColor: active ? 'var(--ink)' : undefined, borderWidth: active ? 2 : 1 }}
                >
                  <div className="text-muted" style={{ fontSize: 11 }}>{monthLabel(k)} · {b.count} inv.</div>
                  <div style={{ fontSize: 17, fontFamily: "'Fraunces',serif" }}>{money(b.invoiced)}</div>
                  <div style={{ fontSize: 11, color: 'var(--sage)' }}>{money(b.collected)} cleared</div>
                  <div style={{ fontSize: 11, color: b.pending > 0 ? 'var(--crimson)' : 'var(--muted)' }}>
                    {b.pending > 0 ? `${money(b.pending)} pending` : 'nothing pending'}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}

      <div className="chip-row">
        <a href="/billing?new=invoice" className={creating === 'invoice' ? 'active' : ''}>+ New invoice</a>
        <a href="/billing?new=quote" className={creating === 'quote' ? 'active' : ''}>+ New quotation</a>
        {creating && <a href="/billing">Close form</a>}
      </div>

      {creating === 'invoice' && (
        <DocForm
          kind="invoice"
          action={createInvoiceAndOpen}
          clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company, project_cost: c.project_cost }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaultTaxPct={settings.business.default_tax_pct}
        />
      )}
      {creating === 'quote' && (
        <DocForm
          kind="quote"
          action={createQuoteAndOpen}
          clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company, project_cost: c.project_cost }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaultTaxPct={settings.business.default_tax_pct}
        />
      )}

      <div className="section-title"><h3>Invoices{scopeLabel}</h3></div>
      <div className="chip-row">
        {(['all', 'pending', 'paid'] as const).map((st) => (
          <a key={st} href={href({ status: st })} className={statusFilter === st ? 'active' : ''}>
            {st === 'all' ? 'All' : st === 'pending' ? 'Pending' : 'Paid'}
          </a>
        ))}
      </div>
      {invoices.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">No invoices yet</div>Create one above — the number is generated for you.</div></div>
      ) : groups.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">Nothing here</div>No {statusFilter === 'all' ? '' : statusFilter + ' '}invoices{scopeLabel}.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="docs">
            <thead><tr><th>Number</th><th>Billed to</th><th>Stream</th><th>Issued</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {groups.map((g) => {
                const b = buckets.get(g.key)!;
                return [
                  <tr key={`h-${g.key}`}>
                    <td colSpan={7} style={{ background: '#F8F9F7', fontSize: 12 }}>
                      <strong>{monthLabel(g.key, true)}</strong>
                      <span className="text-muted"> · {money(b.invoiced)} invoiced · </span>
                      <span style={{ color: 'var(--sage)' }}>{money(b.collected)} cleared</span>
                      <span className="text-muted"> · </span>
                      <span style={{ color: 'var(--crimson)' }}>{money(b.pending)} pending</span>
                    </td>
                  </tr>,
                  ...g.rows.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono"><a href={`/billing/invoices/${inv.id}`}>{inv.number}</a></td>
                  <td>{payer(inv)}</td>
                  <td className="text-muted">{STREAM_LABEL[inv.stream] ?? '—'}</td>
                  <td className="mono">{inv.issued_at ?? '—'}</td>
                  <td className="mono">
                    {money(grandTotal(inv), inv.currency)}
                    {inv.status === 'partial' && (
                      <div className="text-muted" style={{ fontSize: 10.5 }}>
                        {money(paidTotals.get(inv.id) ?? 0, inv.currency)} received
                      </div>
                    )}
                  </td>
                  <td><span className={`tag ${INVOICE_TAG[inv.status] ?? 'idea'}`}>{inv.status}</span></td>
                  <td>
                    <span style={{ display: 'flex', gap: 8 }}>
                      {inv.status !== 'paid' && (
                        <>
                          <ActionButton action={async () => { 'use server'; await markInvoicePaid(inv.id); }} className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }} pendingLabel="Saving…">
                            Mark paid
                          </ActionButton>
                          <a href={`/billing/invoices/${inv.id}#payments`} className="btn-link" style={{ fontSize: 11.5 }}>
                            Add payment
                          </a>
                        </>
                      )}
                      <ActionButton
                        action={async () => { 'use server'; await deleteDoc('invoice', inv.id); }}
                        className="btn-link"
                        confirm={`Delete invoice ${inv.number}?`}
                        pendingLabel="…"
                      >
                        Delete
                      </ActionButton>
                    </span>
                  </td>
                </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title"><h3>Quotations</h3></div>
      {quotes.length === 0 ? (
        <p className="text-muted text-sm">No quotations yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="docs">
            <thead><tr><th>Number</th><th>For</th><th>Stream</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="mono"><a href={`/billing/quotes/${q.id}`}>{q.number}</a></td>
                  <td>{payer(q)}</td>
                  <td className="text-muted">{STREAM_LABEL[q.stream] ?? '—'}</td>
                  <td className="mono">{money(grandTotal(q), q.currency)}</td>
                  <td><span className={`tag ${QUOTE_TAG[q.status] ?? 'idea'}`}>{q.status}</span></td>
                  <td>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <ActionButton action={async () => { 'use server'; await convertQuoteAndOpen(q.id); }} className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }} pendingLabel="Converting…">
                        → Invoice
                      </ActionButton>
                      <ActionButton
                        action={async () => { 'use server'; await deleteDoc('quote', q.id); }}
                        className="btn-link"
                        confirm={`Delete quotation ${q.number}?`}
                        pendingLabel="…"
                      >
                        Delete
                      </ActionButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}