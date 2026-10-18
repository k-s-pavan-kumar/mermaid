import { table } from '@/lib/data';
import type { Product } from './types';

export async function getProducts(ownerId: string): Promise<Product[]> {
  const rows = await table<Product>('products').where((p) => p.owner_id === ownerId);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Never throws — for pages that must keep working before the products migration is run. */
export async function getProductsSafe(ownerId: string): Promise<Product[]> {
  try { return await getProducts(ownerId); } catch { return []; }
}
