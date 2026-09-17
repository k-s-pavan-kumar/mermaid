import { grandTotal, lineTotal, subtotal, taxAmount, STREAM_LABEL, type Invoice, type Quote } from '../types';
import type { BusinessProfile } from '@/features/settings/types';
import type { Client } from '@/features/clients/types';

const money = (n: number, ccy: string) =>
  (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The printable document. Deliberately plain: a heading block, a bill-to
 * block, a table, totals, payment details. It is styled by the `.doc-*`
 * print rules in globals.css so the browser's Save-as-PDF output is the
 * artefact — one layout for screen, print and the client portal.
 */
export function DocumentView({
  doc,
  kind,
  business,
  client,
  projectName,
}: {
  doc: Invoice | Quote;
  kind: 'invoice' | 'quote';
  business: BusinessProfile;
  client?: Client;
  projectName?: string;
}) {
  const items = doc.items ?? [];
  const sub = subtotal(doc);
  const tax = taxAmount(doc);
  const total = grandTotal(doc);
  const isInvoice = kind === 'invoice';
  const invoice = doc as Invoice;
  const quote = doc as Quote;

  return (
    <article className="doc-sheet">
      <header className="doc-head">
        <div>
          <div className="doc-kind">{isInvoice ? 'Invoice' : 'Quotation'}</div>
          <div className="doc-number mono">{doc.number}</div>
        </div>
        <div className="doc-from">
          {business.legal_name && <div className="doc-from-name">{business.legal_name}</div>}
          {business.address && <div className="doc-pre">{business.address}</div>}
          {business.email && <div>{business.email}</div>}
          {business.phone && <div>{business.phone}</div>}
          {business.tax_id && <div className="mono">GSTIN {business.tax_id}</div>}
        </div>
      </header>

      <section className="doc-meta">
        <div>
          <div className="doc-label">Billed to</div>
          <div className="doc-strong">{client?.company || client?.name || '—'}</div>
          {client?.company && client?.name && <div>{client.name}</div>}
          {client?.address && <div className="doc-pre">{client.address}</div>}
          {client?.email && <div>{client.email}</div>}
        </div>
        <div>
          <div className="doc-label">Issued</div>
          <div className="mono">{doc.issued_at ?? '—'}</div>
          <div className="doc-label" style={{ marginTop: 8 }}>{isInvoice ? 'Due' : 'Valid until'}</div>
          <div className="mono">{(isInvoice ? invoice.due_at : quote.valid_until) ?? '—'}</div>
        </div>
        <div>
          <div className="doc-label">Reference</div>
          <div>{doc.description ?? projectName ?? STREAM_LABEL[doc.stream] ?? '—'}</div>
          {projectName && doc.description && <div className="text-muted">{projectName}</div>}
          <div className="doc-label" style={{ marginTop: 8 }}>Status</div>
          <div style={{ textTransform: 'capitalize' }}>{doc.status}</div>
        </div>
      </section>

      <table className="doc-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? (
            items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td className="num mono">{item.qty} {item.unit}{item.qty === 1 ? '' : 's'}</td>
                <td className="num mono">{money(item.rate, doc.currency)}</td>
                <td className="num mono">{money(lineTotal(item), doc.currency)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td>{doc.description ?? 'Professional services'}</td>
              <td className="num mono">1</td>
              <td className="num mono">{money(doc.amount, doc.currency)}</td>
              <td className="num mono">{money(doc.amount, doc.currency)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="doc-totals">
        <div><span>Subtotal</span><span className="mono">{money(sub, doc.currency)}</span></div>
        {doc.tax_pct > 0 && (
          <div><span>Tax ({doc.tax_pct}%)</span><span className="mono">{money(tax, doc.currency)}</span></div>
        )}
        <div className="doc-grand-row"><span>Total</span><span className="mono">{money(total, doc.currency)}</span></div>
        {isInvoice && invoice.status === 'paid' && (
          <div className="doc-paid">Paid {invoice.paid_at ?? ''}</div>
        )}
      </section>

      {(business.payment_details || doc.notes) && (
        <section className="doc-foot-blocks">
          {business.payment_details && (
            <div>
              <div className="doc-label">Payment details</div>
              <div className="doc-pre">{business.payment_details}</div>
            </div>
          )}
          {doc.notes && (
            <div>
              <div className="doc-label">Notes</div>
              <div className="doc-pre">{doc.notes}</div>
            </div>
          )}
        </section>
      )}

      {business.footer_note && <footer className="doc-footer">{business.footer_note}</footer>}
    </article>
  );
}
