/** Business dates that belong on the calendar: audit days, product launches, invoices falling due. Pure. */
export interface DatedEvent { date: string; kind: 'audit' | 'launch' | 'due'; label: string; href: string }

export function datedEvents(input: {
  from: string; to: string;
  audits: { id: string; client_name: string; company: string | null; audit_date: string | null; stage: string }[];
  products: { id: string; name: string; launch_date?: string | null }[];
  openInvoices: { id: string; number: string; due_at: string | null; owed: number; who: string }[];
}): DatedEvent[] {
  const inRange = (d: string | null | undefined): d is string => !!d && d >= input.from && d <= input.to;
  const out: DatedEvent[] = [];
  for (const a of input.audits) if (inRange(a.audit_date) && a.stage !== 'lost') out.push({ date: a.audit_date, kind: 'audit', label: `TPN audit · ${a.company || a.client_name}`, href: '/tpn-audits' });
  for (const p of input.products) if (inRange(p.launch_date)) out.push({ date: p.launch_date, kind: 'launch', label: `Launch · ${p.name}`, href: `/products/${p.id}` });
  for (const i of input.openInvoices) if (inRange(i.due_at) && i.owed > 0) out.push({ date: i.due_at, kind: 'due', label: `Due · ${i.number}${i.who ? ` (${i.who})` : ''} · ₹${Math.round(i.owed).toLocaleString('en-IN')}`, href: `/billing/invoices/${i.id}` });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
