import { table } from '@/lib/data';
import { getInvoicePaidTotals } from '@/features/billing/queries';
import { invoiceMoney, type Invoice } from '@/features/billing/types';
import type { Audit } from '@/features/audits/types';
import type { Product } from '@/features/products/types';
import { datedEvents } from '../dates';

const ICON = { audit: '🛡', launch: '🚀', due: '💳' } as const;

/** One line above the calendar: audits, launches and invoices falling due in the visible range. */
export async function DatesStrip({ email, from, to }: { email: string; from: string; to: string }) {
  let audits: Audit[] = [], products: Product[] = [];
  try { audits = await table<Audit>('audits').where((a) => a.owner_id === email && !!a.audit_date); } catch { /* not migrated */ }
  try { products = await table<Product>('products').where((p) => p.owner_id === email && !!p.launch_date); } catch { /* not migrated */ }
  const [invoices, paid, clients] = await Promise.all([
    table<Invoice>('invoices').where((i) => i.owner_id === email && !!i.due_at && i.due_at >= from && i.due_at <= to),
    getInvoicePaidTotals(email),
    table<{ id: string; owner_id: string; name: string }>('clients').where((c) => c.owner_id === email),
  ]);
  const name = new Map(clients.map((c) => [c.id, c.name]));
  const events = datedEvents({
    from, to, audits, products,
    openInvoices: invoices.map((i) => ({ id: i.id, number: i.number, due_at: i.due_at ?? null, owed: invoiceMoney(i, paid.get(i.id) ?? 0).outstanding, who: (i.client_id && name.get(i.client_id)) || '' })),
  });
  if (events.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
      <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Audits, launches &amp; payments due in this view</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5 }}>
        {events.map((e, i) => (
          <a key={i} href={e.href} style={{ textDecoration: 'none' }}>
            {ICON[e.kind]} <span className="text-muted">{e.date.slice(5)}</span> {e.label}
          </a>
        ))}
      </div>
    </div>
  );
}
