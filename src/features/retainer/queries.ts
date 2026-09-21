import { table } from '@/lib/data';
import type { Invoice } from '@/features/billing/types';

/** Invoices created by the monthly-retainer flow (they carry a `period`). */
export async function getRetainerInvoices(): Promise<Invoice[]> {
  const rows = await table<Invoice>('invoices').where((i) => !!i.period);
  return rows;
}
