import { table } from '@/lib/data';
import { todayIso } from '@/lib/tz/today';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { getBrainDump, getTasksForDate, getOverdueTasks } from '@/features/today/queries';
import { getInvoices, getQuotes } from '@/features/billing/queries';
import { getSettings } from '@/features/settings/queries';
import { grandTotal, subtotal, type IncomeStream, type Invoice, type LineItem, type Quote } from '@/features/billing/types';
import { TYPE_LABEL } from '@/lib/project-colors';
import type { Project, ProjectType } from '@/features/projects/types';
import type { Task } from '@/features/today/types';
import type { Client, WorkType } from '@/features/clients/types';
import type { Meeting } from '@/features/meetings/types';
import { newId } from '@/lib/id';

/**
 * The assistant's hands.
 *
 * Every tool goes through the same `table()` layer the UI uses, so anything
 * the assistant creates is a real row with the same shape — there is no
 * separate "AI-created" path that could drift. Tools are deliberately
 * coarse ("create an invoice") rather than raw database access: the model
 * never gets to write arbitrary fields, and a malformed argument fails in
 * one place instead of corrupting a row.
 */

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSpec {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
  };
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

export const TOOL_SPECS: ToolSpec[] = [
  fn('get_day_summary', 'Everything happening on a given day: scheduled tasks, unscheduled brain-dump items, overdue tasks, meetings. Use this for "summarise my day" style questions.', {
    date: str("Date as YYYY-MM-DD. Omit for today."),
  }),
  fn('list_projects', 'List projects with their status and type.', {}),
  fn('list_clients', 'List clients with their work types and timezone.', {}),
  fn('list_billing', 'Quotes and invoices with totals and status, plus income split by stream.', {
    status: str("Optional filter: draft, pending, paid, overdue, sent, accepted, declined."),
  }),
  fn('create_task', 'Capture a task. Leave date/hour out to drop it in the brain dump.', {
    title: str('What needs doing.'),
    project: str('Project name or id, optional.'),
    date: str('YYYY-MM-DD to schedule it, optional.'),
    hour: num('Hour of day 8-21 to schedule it at, optional.'),
  }, ['title']),
  fn('create_project', 'Create a project.', {
    name: str('Project name.'),
    types: { type: 'array', items: { type: 'string' }, description: `One or more of: ${Object.keys(TYPE_LABEL).join(', ')}` },
    client: str('Client name or id, optional.'),
    status: str('idea | ontrack | review | risk | done'),
    description: str('Optional description.'),
  }, ['name']),
  fn('create_client', 'Add a client.', {
    name: str('Contact name.'),
    company: str('Company, optional.'),
    email: str('Email, optional.'),
    timezone: str("IANA timezone, e.g. Asia/Kolkata. Defaults to Asia/Kolkata."),
    work_types: { type: 'array', items: { type: 'string' }, description: 'web, mobile, design, security, teaching, consulting, maintenance, content' },
  }, ['name']),
  fn('create_billing_doc', 'Draft an invoice or a quotation. Amounts are per line item; the number is generated automatically.', {
    kind: str("'invoice' or 'quote'."),
    client: str('Client name or id.'),
    project: str('Project name or id, optional.'),
    stream: str('freelance | teaching | product | bounty | other'),
    description: str('One-line summary of what is being billed.'),
    items: {
      type: 'array',
      description: 'Line items.',
      items: {
        type: 'object',
        properties: {
          description: str('Line description'),
          qty: num('Quantity'),
          rate: num('Rate per unit'),
          unit: str("Unit: hour, session, seat, item"),
        },
        required: ['description', 'rate'],
      },
    },
    due_at: str('Invoice due date YYYY-MM-DD, optional.'),
  }, ['kind', 'items']),
  fn('schedule_meeting', 'Put a client meeting on the record.', {
    client: str('Client name or id.'),
    title: str('What the meeting is about.'),
    starts_at: str('ISO datetime, e.g. 2026-09-18T15:30.'),
    duration_mins: num('Length in minutes, default 30.'),
    location: str('Link or place, optional.'),
  }, ['client', 'title', 'starts_at']),
];

function matchByNameOrId<T extends { id: string; name: string }>(rows: T[], needle?: string): T | undefined {
  if (!needle) return undefined;
  const n = needle.trim().toLowerCase();
  return rows.find((r) => r.id === needle) ?? rows.find((r) => r.name.toLowerCase() === n) ?? rows.find((r) => r.name.toLowerCase().includes(n));
}

export interface ToolResult {
  /** JSON-serialisable payload handed back to the model. */
  data: unknown;
  /** Human-facing line shown in the panel, and the path to revalidate. */
  effect?: { label: string; href?: string };
}

export async function runTool(name: string, args: Record<string, any>, ownerId: string): Promise<ToolResult> {
  switch (name) {
    case 'get_day_summary': {
      const date = typeof args.date === 'string' && args.date ? args.date : todayIso();
      const [scheduled, dump, overdue, meetings] = await Promise.all([
        getTasksForDate(ownerId, date),
        getBrainDump(ownerId),
        getOverdueTasks(ownerId, todayIso()),
        table<Meeting>('meetings').where((m) => m.owner_id === ownerId && m.starts_at.slice(0, 10) === date),
      ]);
      return {
        data: {
          date,
          scheduled: scheduled.map((t) => ({ title: t.title, hour: t.scheduled_hour, hours: t.duration_hours, done: t.done })),
          unscheduled: dump.slice(0, 20).map((t) => ({ title: t.title, captured: t.dump_date })),
          overdue: overdue.map((t) => ({ title: t.title, was_due: t.scheduled_date })),
          meetings: meetings.map((m) => ({ title: m.title, starts_at: m.starts_at, mins: m.duration_mins })),
        },
      };
    }

    case 'list_projects': {
      const projects = await getProjects();
      return { data: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, types: p.types ?? [p.type] })) };
    }

    case 'list_clients': {
      const clients = await getClients(ownerId);
      return { data: clients.map((c) => ({ id: c.id, name: c.name, company: c.company, timezone: c.timezone, work_types: c.work_types ?? [], status: c.status })) };
    }

    case 'list_billing': {
      const [invoices, quotes] = await Promise.all([getInvoices(ownerId), getQuotes(ownerId)]);
      const filter = (rows: (Invoice | Quote)[]) =>
        (args.status ? rows.filter((r) => r.status === args.status) : rows).slice(0, 40);
      return {
        data: {
          invoices: filter(invoices).map((i) => ({ number: i.number, status: i.status, total: grandTotal(i), stream: i.stream, issued_at: i.issued_at })),
          quotes: filter(quotes).map((q) => ({ number: q.number, status: q.status, total: grandTotal(q), stream: q.stream })),
        },
      };
    }

    case 'create_task': {
      const projects = await getProjects();
      const project = matchByNameOrId(projects, args.project);
      const task = await table<Task>('tasks').insert({
        id: newId('task'),
        owner_id: ownerId,
        project_id: project?.id ?? null,
        title: String(args.title),
        dump_date: todayIso(),
        scheduled_date: typeof args.date === 'string' && args.date ? args.date : null,
        scheduled_hour: typeof args.hour === 'number' ? Math.min(21, Math.max(8, Math.round(args.hour))) : null,
        duration_hours: 1,
        done: false,
        created_at: new Date().toISOString(),
      });
      return {
        data: { ok: true, id: task.id, scheduled: !!task.scheduled_date },
        effect: { label: `Task added: ${task.title}`, href: '/today' },
      };
    }

    case 'create_project': {
      const clients = await getClients(ownerId);
      const client = matchByNameOrId(clients, args.client);
      const rawTypes: string[] = Array.isArray(args.types) ? args.types.map(String) : [];
      const valid = rawTypes.filter((t): t is ProjectType => t in TYPE_LABEL);
      const types: [ProjectType, ...ProjectType[]] = valid.length
        ? [valid[0]!, ...valid.slice(1)]
        : [client ? 'client' : 'internal'];

      const project = await table<Project>('projects').insert({
        id: newId('proj'),
        owner_id: ownerId,
        name: String(args.name),
        type: types[0],
        types,
        client_id: client?.id ?? null,
        status: (['idea', 'ontrack', 'review', 'risk', 'done'].includes(args.status) ? args.status : 'idea') as Project['status'],
        description: args.description ? String(args.description) : null,
        created_at: new Date().toISOString(),
      });
      return { data: { ok: true, id: project.id }, effect: { label: `Project created: ${project.name}`, href: `/projects/${project.id}` } };
    }

    case 'create_client': {
      const client = await table<Client>('clients').insert({
        id: newId('client'),
        owner_id: ownerId,
        name: String(args.name),
        company: args.company ? String(args.company) : null,
        email: args.email ? String(args.email) : null,
        phone: null,
        address: null,
        timezone: args.timezone ? String(args.timezone) : 'Asia/Kolkata',
        work_types: (Array.isArray(args.work_types) ? args.work_types.map(String) : []) as WorkType[],
        project_cost: null,
        billing_type: 'project',
        monthly_fee: null,
        retainer_start: null,
        retainer_due_day: null,
        status: 'active',
        notes: null,
        portal_token: null,
        created_at: new Date().toISOString(),
      });
      return { data: { ok: true, id: client.id }, effect: { label: `Client added: ${client.name}`, href: `/clients/${client.id}` } };
    }

    case 'create_billing_doc': {
      const kind = args.kind === 'quote' ? 'quote' : 'invoice';
      const [clients, projects, settings] = await Promise.all([getClients(ownerId), getProjects(), getSettings(ownerId)]);
      const client = matchByNameOrId(clients, args.client);
      const project = matchByNameOrId(projects, args.project);

      const items: LineItem[] = (Array.isArray(args.items) ? args.items : []).map((i: any) => ({
        description: String(i.description ?? 'Services'),
        qty: Number(i.qty) || 1,
        rate: Number(i.rate) || 0,
        unit: String(i.unit ?? 'item'),
      }));
      if (items.length === 0) return { data: { ok: false, error: 'No line items supplied.' } };

      const amount = subtotal({ items, amount: 0 });
      const existing = kind === 'invoice' ? await table<Invoice>('invoices').all() : await table<Quote>('quotes').all();
      const prefix = kind === 'invoice' ? settings.business.invoice_prefix : settings.business.quote_prefix;
      const year = todayIso().slice(0, 4);
      const stem = `${prefix}-${year}-`;
      const highest = existing
        .map((r) => r.number)
        .filter((n) => n?.startsWith(stem))
        .map((n) => Number(n.slice(stem.length)) || 0)
        .reduce((m, n) => Math.max(m, n), 0);
      const number = `${stem}${String(highest + 1).padStart(3, '0')}`;

      const common = {
        id: newId(kind === 'invoice' ? 'inv' : 'quote'),
        owner_id: ownerId,
        project_id: project?.id ?? null,
        client_id: client?.id ?? null,
        stream: (['freelance', 'teaching', 'product', 'bounty', 'other'].includes(args.stream) ? args.stream : 'freelance') as IncomeStream,
        number,
        description: args.description ? String(args.description) : null,
        items,
        amount,
        tax_pct: settings.business.default_tax_pct,
        currency: 'INR',
        notes: null,
        issued_at: todayIso(),
      };

      if (kind === 'invoice') {
        const inv = await table<Invoice>('invoices').insert({
          ...common,
          quote_id: null,
          status: 'draft',
          due_at: args.due_at ? String(args.due_at) : null,
          paid_at: null,
          tds_amount: 0,
        });
        return { data: { ok: true, number, total: grandTotal(inv) }, effect: { label: `Draft invoice ${number}`, href: `/billing/invoices/${inv.id}` } };
      }

      const q = await table<Quote>('quotes').insert({ ...common, status: 'draft', valid_until: null });
      return { data: { ok: true, number, total: grandTotal(q) }, effect: { label: `Draft quotation ${number}`, href: `/billing/quotes/${q.id}` } };
    }

    case 'schedule_meeting': {
      const clients = await getClients(ownerId);
      const client = matchByNameOrId(clients, args.client);
      if (!client) return { data: { ok: false, error: 'No matching client.' } };

      const meeting = await table<Meeting>('meetings').insert({
        id: newId('meet'),
        owner_id: ownerId,
        client_id: client.id,
        project_id: null,
        title: String(args.title),
        starts_at: String(args.starts_at),
        duration_mins: Number(args.duration_mins) || 30,
        location: args.location ? String(args.location) : null,
        attendees: null,
        notes: null,
        follow_up: null,
        created_at: new Date().toISOString(),
      });
      return { data: { ok: true, id: meeting.id }, effect: { label: `Meeting booked with ${client.name}`, href: `/clients/${client.id}?tab=meetings` } };
    }

    default:
      return { data: { ok: false, error: `Unknown tool ${name}` } };
  }
}
