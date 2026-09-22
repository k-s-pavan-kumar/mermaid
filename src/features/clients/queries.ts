import { table } from '@/lib/data';
import type { Client } from './types';
import type { Project } from '@/features/projects/types';
import type { Task } from '@/features/today/types';
import type { Note } from '@/features/notes/types';
import type { Meeting } from '@/features/meetings/types';
import { getBillingForClient, getInvoicePaidTotals } from '@/features/billing/queries';
import { grandTotal } from '@/features/billing/types';
import type { FocusSession } from '@/features/today/types';
import { projectTime } from '@/features/projects/time';

export async function getClients(ownerId: string): Promise<Client[]> {
  const clients = await table<Client>('clients').where((c) => c.owner_id === ownerId);
  return clients.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientById(id: string): Promise<Client | undefined> {
  return table<Client>('clients').find(id);
}

export async function getClientByToken(token: string): Promise<Client | undefined> {
  // Tokens are 32 chars (24 random bytes, base64url). Reject anything shorter
  // outright so an empty or guessable value can never match a row.
  if (!token || token.length < 20) return undefined;
  return table<Client>('clients').findBy('portal_token', token);
}

/**
 * Everything that belongs to one client, in one read — this is what turns
 * the client page from a contact card into a workspace: their projects,
 * the open work across those projects, notes, meetings and money, without
 * the page having to know how any of those features store their rows.
 */
export async function getClientWorkspace(clientId: string) {
  const client = await getClientById(clientId);
  if (!client) return undefined;

  const projects = await table<Project>('projects').where((p) => p.client_id === clientId);
  const projectIds = projects.map((p) => p.id);

  const [tasks, notes, meetings, billing, sessions, paidTotals] = await Promise.all([
    table<Task>('tasks').where((t) => !!t.project_id && projectIds.includes(t.project_id)),
    table<Note>('notes').where((n) => n.client_id === clientId || (!!n.project_id && projectIds.includes(n.project_id))),
    table<Meeting>('meetings').where((m) => m.client_id === clientId),
    getBillingForClient(clientId, projectIds),
    table<FocusSession>('focus_sessions').where((s) => !!s.project_id && projectIds.includes(s.project_id)),
    getInvoicePaidTotals(client.owner_id),
  ]);

  const invoiced = billing.invoices
    .filter((i) => i.status !== 'draft')
    .reduce((s, i) => s + grandTotal(i), 0);
  const paid = billing.invoices
    .filter((i) => i.status === 'paid' || i.status === 'partial')
    .reduce((s, i) => s + Math.min(grandTotal(i), paidTotals.get(i.id) ?? 0), 0);

  return {
    client,
    projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
    tasks: tasks.sort((a, b) => Number(a.done) - Number(b.done)),
    notes,
    meetings: meetings.sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    invoices: billing.invoices,
    quotes: billing.quotes,
    money: { invoiced, paid, outstanding: Math.round((invoiced - paid) * 100) / 100 },
    time: projectTime({ tasks, sessions, invoiced, collected: paid, agreedCost: client.project_cost }),
  };
}
