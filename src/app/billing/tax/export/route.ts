import { getSessionEmail } from '@/lib/auth/session';
import { table } from '@/lib/data';
import type { Invoice } from '@/features/billing/types';
import { fyLabel, fyOf, taxCsv, taxSummary } from '@/features/tax/compute';
import type { TdsCheck } from '@/features/tax/actions';
import { todayIso } from '@/lib/tz/today';

/** GET /billing/tax/export?fy=2026 → CSV of the financial year's tax summary. */
export async function GET(req: Request) {
  const email = await getSessionEmail();
  if (!email) return new Response('Not signed in', { status: 401 });
  const raw = Number(new URL(req.url).searchParams.get('fy'));
  const fy = Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : fyOf(todayIso());
  const [invoices, clients] = await Promise.all([
    table<Invoice>('invoices').where((i) => i.owner_id === email),
    table<{ id: string; owner_id: string; name: string }>('clients').where((c) => c.owner_id === email),
  ]);
  let checks: TdsCheck[] = [];
  try { checks = await table<TdsCheck>('tds_checks').where((c) => c.owner_id === email && c.fy === fy); } catch { /* migration 024 not applied */ }
  const csv = taxCsv(taxSummary(invoices, new Map(clients.map((c) => [c.id, c.name])), fy), new Set(checks.filter((c) => c.matched).map((c) => c.client_id)));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tax-summary-${fyLabel(fy).replace(/\s/g, '-')}.csv"`,
    },
  });
}
