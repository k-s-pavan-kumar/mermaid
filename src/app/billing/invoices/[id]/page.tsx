import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getInvoiceById, getInvoicePayments } from '@/features/billing/queries';
import { markInvoicePaid, recordInvoicePayment, deleteInvoicePayment, setInvoiceTds, setDocStatus } from '@/features/billing/actions';
import { balanceDue, grandTotal } from '@/features/billing/types';
import { getClientById } from '@/features/clients/queries';
import { getSettings } from '@/features/settings/queries';
import { todayIso } from '@/lib/tz/today';
import { table } from '@/lib/data';
import { DocumentView } from '@/features/billing/components/DocumentView';
import { PrintButton } from '@/features/billing/components/PrintButton';
import { ActionButton } from '@/components/ActionButton';
import type { Project } from '@/features/projects/types';

const money = (n: number, ccy = 'INR') =>
  (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const [settings, client, project, payments] = await Promise.all([
    getSettings(email),
    invoice.client_id ? getClientById(invoice.client_id) : Promise.resolve(undefined),
    invoice.project_id ? table<Project>('projects').find(invoice.project_id) : Promise.resolve(undefined),
    getInvoicePayments(email, invoice.id),
  ]);

  const paidSoFar = Math.round(payments.reduce((n, p) => n + p.amount, 0) * 100) / 100;
  const remaining = balanceDue(invoice, paidSoFar);

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <a href="/billing" className="btn-ghost" style={{ textDecoration: 'none' }}>‹ Billing</a>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {invoice.status !== 'paid' && (
            <ActionButton action={async () => { 'use server'; await markInvoicePaid(invoice.id); }} className="btn-ghost" pendingLabel="Saving…">
              Mark paid
            </ActionButton>
          )}
          {invoice.status === 'draft' && (
            <ActionButton action={async () => { 'use server'; await setDocStatus('invoice', invoice.id, 'pending'); }} className="btn-ghost" pendingLabel="Sending…">
              Mark sent
            </ActionButton>
          )}
          <PrintButton />
        </span>
      </div>

      <DocumentView doc={invoice} kind="invoice" business={settings.business} client={client} projectName={project?.name} />

      <div id="payments" className="card" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          <h3>Payments</h3>
        </div>

        {payments.length > 0 && (
          <table className="docs" style={{ marginBottom: 12 }}>
            <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th /></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.date}</td>
                  <td className="mono">{money(p.amount, invoice.currency)}</td>
                  <td className="text-muted">{p.note || '—'}</td>
                  <td>
                    <ActionButton
                      action={async () => { 'use server'; await deleteInvoicePayment(p.id); }}
                      className="btn-link"
                      confirm="Remove this payment?"
                      pendingLabel="…"
                    >
                      Delete
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {money(paidSoFar, invoice.currency)} received of {money(grandTotal(invoice) - (invoice.tds_amount ?? 0), invoice.currency)}
          </span>
          {remaining > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--crimson)' }}>{money(remaining, invoice.currency)} still owed</span>
          )}
        </div>

        {remaining > 0 && (
          <form
            action={async (fd) => { 'use server'; await recordInvoicePayment(fd); }}
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}
          >
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <label style={{ fontSize: 12.5 }}>
              Amount
              <br />
              <input name="amount" type="number" min={0} max={remaining} step="0.01" defaultValue={remaining}
                style={{ width: 130, fontSize: 12.5, padding: '4px 8px' }} required />
            </label>
            <label style={{ fontSize: 12.5 }}>
              Date received
              <br />
              <input name="date" type="date" defaultValue={todayIso()}
                style={{ fontSize: 12.5, padding: '4px 8px' }} required />
            </label>
            <label style={{ fontSize: 12.5 }}>
              Note
              <br />
              <input name="note" type="text" placeholder="optional" style={{ fontSize: 12.5, padding: '4px 8px' }} />
            </label>
            <button type="submit" className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }}>Add payment</button>
          </form>
        )}
      </div>

      <div className="doc-hint" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <form
          action={async (fd) => { 'use server'; await setInvoiceTds(invoice.id, Number(fd.get('tds') ?? 0)); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <label htmlFor="tds" style={{ fontSize: 12.5 }}>TDS deducted by client</label>
          <input id="tds" name="tds" type="number" min={0} step="0.01" defaultValue={invoice.tds_amount || ''} placeholder="0"
            style={{ width: 110, fontSize: 12.5, padding: '4px 8px' }} />
          <button type="submit" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }}>Save</button>
        </form>
        <span className="text-muted" style={{ fontSize: 11.5 }}>
          Netted out of what posts to Daily Finance{invoice.status === 'paid' ? ' — already applied to the posted entry' : ' once marked paid'}.
        </span>
      </div>

      <p className="doc-hint">
        Use your browser&apos;s print dialog → <b>Save as PDF</b> for a file to email. Margins and
        page breaks are already set up for A4.
      </p>
    </div>
  );
}
