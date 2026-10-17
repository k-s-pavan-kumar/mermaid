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

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { new: creating } = await searchParams;
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

  const totals = invoices.reduce(
    (acc, i) => {
      const t = grandTotal(i);
      if (i.status !== 'draft') acc.invoiced += t;
      if (i.status === 'paid' || i.status === 'partial') acc.paid += Math.min(t, paidTotals.get(i.id) ?? 0);
      return acc;
    },
    { invoiced: 0, paid: 0 }
  );

  return (
    <Shell active="billing" title="Billing" crumb="Workspace">
      <div className="stat-row three">
        <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{money(totals.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Collected</div><div className="val" style={{ color: 'var(--sage)' }}>{money(totals.paid)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: 'var(--crimson)' }}>{money(totals.invoiced - totals.paid)}</div></div>
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
      {invoices.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">No invoices yet</div>Create one above — the number is generated for you.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="docs">
            <thead><tr><th>Number</th><th>Billed to</th><th>Stream</th><th>Issued</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {invoices.map((inv) => (
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
