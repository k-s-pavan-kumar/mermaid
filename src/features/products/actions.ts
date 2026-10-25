'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import { createProjectRecord } from '@/features/projects/service';
import type { Project } from '@/features/projects/types';
import type { Tag } from '@/features/tags/types';
import { ROLES, isProductRole, roleInfo, type Product, type ProductRole } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function refresh(productId?: string) {
  revalidatePath('/products');
  if (productId) revalidatePath(`/products/${productId}`);
  revalidatePath('/projects');
  revalidatePath('/fields/[id]', 'page');
}

async function ownProduct(owner: string, id: string): Promise<Product | undefined> {
  const p = await table<Product>('products').find(id);
  return p && p.owner_id === owner ? p : undefined;
}

/** The Field a piece is filed under, matched by name (case-insensitive). Null if you don't have that field. */
async function fieldIdFor(owner: string, fieldName: string | null): Promise<string | null> {
  if (!fieldName) return null;
  try {
    const tags = await table<Tag>('tags').where((t) => t.owner_id === owner && t.is_field);
    return tags.find((t) => t.name.toLowerCase() === fieldName.toLowerCase())?.id ?? null;
  } catch { return null; }
}

async function makePiece(owner: string, product: Product, role: ProductRole, customName?: string | null): Promise<void> {
  const info = roleInfo(role)!;
  await createProjectRecord(owner, {
    name: (customName?.trim() || `${product.name} — ${info.label}`).slice(0, 120),
    type: info.projectType,
    description: null,
    fieldId: await fieldIdFor(owner, info.fieldName),
    productId: product.id,
    productRole: role,
  });
}

/**
 * New product. "Create the whole set" makes the SaaS, App, Book, Game and
 * Marketing projects in one go, each filed under the matching field, so the
 * family exists from day one and you just tick things off.
 */
export async function createProduct(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const name = String(formData.get('name') ?? '').trim().slice(0, 100);
  if (!name) return;
  const product = await table<Product>('products').insert({
    id: newId(), owner_id: owner, name,
    description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
    created_at: new Date().toISOString(),
  });
  if (formData.get('create_all') === 'on') {
    for (const r of ROLES) {
      try { await makePiece(owner, product, r.role); } catch { /* the product is saved; add missing pieces from its page */ }
    }
  }
  refresh();
  redirect(`/products/${product.id}`);
}

/** Add one piece (a project) to the product, named after it unless you give a name. Form: role, name. */
export async function addProductPiece(productId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const product = await ownProduct(owner, productId);
  const role = String(formData.get('role') ?? '');
  if (!product || !isProductRole(role)) return;
  await makePiece(owner, product, role, String(formData.get('name') ?? ''));
  refresh(productId);
}

/** Attach an existing project to the product in a role. Form: project_id, role. */
export async function attachProjectToProduct(productId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const product = await ownProduct(owner, productId);
  const role = String(formData.get('role') ?? '');
  const projectId = String(formData.get('project_id') ?? '');
  const project = projectId ? await table<Project>('projects').find(projectId) : undefined;
  if (!product || !isProductRole(role) || !project || project.owner_id !== owner) return;
  const fieldId = await fieldIdFor(owner, roleInfo(role)!.fieldName);
  await table<Project>('projects').update(projectId, {
    product_id: productId, product_role: role, ...(fieldId && !project.field_id ? { field_id: fieldId } : {}),
  });
  refresh(productId);
}

/** Take a project out of its product (the project itself stays). */
export async function detachProject(projectId: string): Promise<void> {
  const owner = await requireOwner();
  const project = await table<Project>('projects').find(projectId);
  if (!project || project.owner_id !== owner) return;
  await table<Project>('projects').update(projectId, { product_id: null, product_role: null });
  refresh(project.product_id ?? undefined);
}

/** Delete a product. Its projects and goals are kept; they just stop belonging to it. */
export async function deleteProduct(productId: string): Promise<void> {
  const owner = await requireOwner();
  if (!(await ownProduct(owner, productId))) return;
  const pieces = await table<Project>('projects').where((p) => p.owner_id === owner && p.product_id === productId);
  for (const p of pieces) await table<Project>('projects').update(p.id, { product_id: null, product_role: null });
  const goals = await table<{ id: string; owner_id: string; product_id?: string | null }>('goals').where((g) => g.owner_id === owner && g.product_id === productId);
  for (const g of goals) await table<{ id: string; product_id?: string | null }>('goals').update(g.id, { product_id: null });
  await table<Product>('products').remove(productId);
  refresh();
}

/** Set (or clear) a product's launch date. Form: launch_date. */
export async function setLaunchDate(productId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  if (!(await ownProduct(owner, productId))) return;
  const raw = String(formData.get('launch_date') ?? '').trim();
  const launch_date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  await table<Product>('products').update(productId, { launch_date } as Partial<Product>);
  refresh(productId);
  revalidatePath('/calendar');
  revalidatePath('/digest');
}
