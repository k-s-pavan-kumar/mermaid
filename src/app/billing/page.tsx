import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getInvoices, getQuotes, getIncomeByStream, getInvoicePaidTotals } from '@/features/billing/queries';
import { createInvoiceAndOpen, createQuoteAndOpen, markInvoicePaid, convertQuoteAndOpen, deleteDoc } from '@/features/billing/actions';
import { grandTotal, STREAM_LABEL } from '@/features/billing/types';
import { getClients } from '@/features/clients/queries';
import { getProjects } from '@/features/projects/queries';
import { getSettings } from '@/features/settings/queries';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';
import { ActionButton } from '@/components/ActionButton';
import { DocForm } from '@/features/billing/components/DocForm';

const money = (n: number, ccy = 'INR') =>
  (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const INVOICE_TAG: Record<string, string> = { paid: 'ontrack', overdue: 'risk', partial: 'review', pending: 'review', draft: 'idea' };
const QUOTE_TAG: Record<string, string> = { accepted: 'ontrack', declined: 'risk', sent: 'review', draft: 'idea' };

const PENDING_STATUSES = ['pending', 'partial', 'overdue'];
type StatusFilter = 'all' | 'pending' | 'paid';

const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : 'none');
const monthLabel = (ym: string) =>
  ym === 'none'
    ? 'No date'
    : new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type Bucket = { invoiced: number; cleared: number; pending: number; count: number };
const emptyBucket = (): Bucket => ({ invoiced: 0, cleared: 0, pending: 0, count: 0 });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ new?: string; status?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { new: creating, status: statusParam } = await searchParams;
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

  // Money per invoice. Paid = the whole amount is cleared (even if no payment
  // entry was recorded); partial = whatever payments have been recorded;
  // everything else (pending/overdue) = nothing cleared yet. Drafts don't count.
  const moneyOf = (i: (typeof invoices)[number]) => {
    const t = grandTotal(i);
    if (i.status === 'draft') return { billed: 0, cleared: 0 };
    if (i.status === 'paid') return { billed: t, cleared: t };
    if (i.status === 'partial') return { billed: t, cleared: Math.min(t, paidTotals.get(i.id) ?? 0) };
    return { billed: t, cleared: 0 };
  };

  const buckets = new Map<string, Bucket>();
  const overall = emptyBucket();
  for (const inv of invoices) {
    const m = moneyOf(inv);
    for (const b of [overall, buckets.get(monthKey(inv.issued_at)) ?? buckets.set(monthKey(inv.issued_at), emptyBucket()).get(monthKey(inv.issued_at))!]) {
      b.invoiced += m.billed; b.cleared += m.cleared; b.pending += m.billed - m.cleared; b.count += 1;
    }
  }

  const currentMonth = todayIso().slice(0, 7);
  const olderMonths = [...buckets.keys()]
    .filter((k) => k !== currentMonth)
    .sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)));

  const passesFilter = (i: (typeof invoices)[number]) =>
    statusFilter === 'paid' ? i.status === 'paid' : statusFilter === 'pending' ? PENDING_STATUSES.includes(i.status) : true;
  const rowsFor = (k: string) => invoices.filter((i) => monthKey(i.issued_at) === k && passesFilter(i));

  const statusHref = (st: StatusFilter) => (st === 'all' ? '/billing' : `/billing?status=${st}`);
  const pct = overall.invoiced > 0 ? Math.round((overall.cleared / overall.invoiced) * 100) : 0;

  const renderTable = (rows: typeof invoices) => (
    <div className="table-wrap">
      <table className="docs">
        <thead><tr><th>Number</th><th>Billed to</th><th>Stream</th><th>Issued</th><th>Total</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((inv) => (
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
          ))}
        </tbody>
      </table>
    </div>
  );

  const monthPills = (b: Bucket) => (
    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      <span className="tag" style={{ background: '#F0EDFC', color: 'var(--ink)' }}>{money(b.invoiced)} invoiced</span>
      <span className="tag ontrack">{money(b.cleared)} cleared</span>
      <span className={`tag ${b.pending > 0 ? 'risk' : 'idea'}`}>{money(b.pending)} pending</span>
    </span>
  );

  const currentRows = rowsFor(currentMonth);
  const currentBucket = buckets.get(currentMonth) ?? emptyBucket();

  const stat = (label: string, value: string, sub: string, color: string, bar?: number) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `4px solid ${color}`, borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, color, margin: '4px 0 2px' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</div>
      {bar !== undefined && (
        <div style={{ height: 5, borderRadius: 3, background: 'var(--border-light)', marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${bar}%`, height: '100%', background: color }} />
        </div>
      )}
    </div>
  );

  return (
    <Shell active="billing" title="Billing" crumb="Workspace">
      <div className="stat-row three">
        {stat('Invoiced', money(overall.invoiced), `${overall.count} invoices · all time`, 'var(--ink)')}
        {stat('Collected', money(overall.cleared), `${pct}% of invoiced`, 'var(--sage)', pct)}
        {stat('Outstanding', money(overall.pending), `${100 - pct}% still to collect`, 'var(--crimson)', overall.invoiced > 0 ? 100 - pct : 0)}
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

      <div className="section-title"><h3>Invoices</h3></div>
      <div className="chip-row">
        {(['all', 'pending', 'paid'] as const).map((st) => (
          <a key={st} href={statusHref(st)} className={statusFilter === st ? 'active' : ''}>
            {st === 'all' ? 'All' : st === 'pending' ? 'Pending' : 'Paid'}
          </a>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">No invoices yet</div>Create one above — the number is generated for you.</div></div>
      ) : (
        <>
          {/* Current month — always open */}
          <div style={{ background: 'var(--surface)', border: '2px solid var(--pine)', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--pine-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 18 }}>{monthLabel(currentMonth)}</span>
                <span className="tag done">current month</span>
                <span className="text-muted" style={{ fontSize: 11.5 }}>{currentBucket.count} invoices</span>
              </div>
              {monthPills(currentBucket)}
            </div>
            {currentRows.length > 0 ? renderTable(currentRows) : (
              <div className="text-muted" style={{ padding: '18px 16px', fontSize: 13 }}>
                {currentBucket.count === 0 ? 'No invoices this month yet.' : `No ${statusFilter} invoices this month.`}
              </div>
            )}
          </div>

          {/* Earlier months — collapsed, click to expand */}
          {olderMonths.length > 0 && <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', margin: '18px 0 8px' }}>Earlier months</div>}
          {olderMonths.map((k) => {
            const rows = rowsFor(k);
            if (statusFilter !== 'all' && rows.length === 0) return null;
            const b = buckets.get(k)!;
            return (
              <details key={k} className="mgroup">
                <summary>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="chev">▸</span>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16 }}>{monthLabel(k)}</span>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>{b.count} invoices</span>
                  </span>
                  {monthPills(b)}
                </summary>
                {rows.length > 0 ? renderTable(rows) : <div className="text-muted" style={{ padding: '14px 16px', fontSize: 13 }}>No {statusFilter} invoices.</div>}
              </details>
            );
          })}
        </>
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
