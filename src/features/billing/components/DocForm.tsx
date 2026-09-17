'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { STREAM_LABEL, type IncomeStream } from '../types';

interface Row { id: number; description: string; qty: number; rate: number; unit: string }

const UNITS = ['hour', 'session', 'day', 'seat', 'month', 'item'];

let seq = 0;
const blank = (rate = 0): Row => ({ id: ++seq, description: '', qty: 1, rate, unit: 'hour' });

/**
 * One form for both documents.
 *
 * Line items are the reason this is a client component: teaching invoices
 * are "8 sessions × ₹1,500", freelance ones are "22 hours × ₹2,000", and
 * typing a single lump sum loses the breakdown the client asks about a week
 * later. The running total is computed here so you see the number before
 * you commit, and posted as plain repeated form fields so the server needs
 * no special parsing.
 */
export function DocForm({
  kind,
  action,
  clients,
  projects,
  defaultTaxPct,
  defaultClientId,
  defaultProjectId,
  defaultStream = 'freelance',
  defaultRate,
}: {
  kind: 'invoice' | 'quote';
  action: (formData: FormData) => Promise<void>;
  clients: { id: string; name: string; company: string | null; rate: number | null }[];
  projects: { id: string; name: string }[];
  defaultTaxPct: number;
  defaultClientId?: string;
  defaultProjectId?: string;
  defaultStream?: IncomeStream;
  defaultRate?: number | null;
}) {
  const [rows, setRows] = useState<Row[]>([blank(defaultRate ?? 0)]);
  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const [taxPct, setTaxPct] = useState(defaultTaxPct);

  const subtotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const tax = subtotal * (taxPct / 100);
  const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  function patch(id: number, p: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function pickClient(id: string) {
    setClientId(id);
    const rate = clients.find((c) => c.id === id)?.rate;
    // Pre-fill an empty first row with the client's agreed rate — saves the
    // single most-retyped number in the whole flow.
    if (rate && rows.length === 1 && rows[0]!.rate === 0 && rows[0]!.description === '') {
      patch(rows[0]!.id, { rate });
    }
  }

  return (
    <form action={action} className="card doc-form">
      <div className="grid-2-eq">
        <div>
          <label className="field-label" htmlFor="client_id">Bill to</label>
          <select id="client_id" name="client_id" value={clientId} onChange={(e) => pickClient(e.target.value)} style={{ width: '100%' }}>
            <option value="">— No client on record —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="project_id">Project (optional)</label>
          <select id="project_id" name="project_id" defaultValue={defaultProjectId ?? ''} style={{ width: '100%' }}>
            <option value="">— Not tied to a project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2-eq">
        <div>
          <label className="field-label" htmlFor="stream">Income stream</label>
          <select id="stream" name="stream" defaultValue={defaultStream} style={{ width: '100%' }}>
            {(Object.keys(STREAM_LABEL) as IncomeStream[]).map((s) => (
              <option key={s} value={s}>{STREAM_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="description">Summary line</label>
          <input id="description" name="description" placeholder="e.g. Figma UI/UX cohort — September batch" style={{ width: '100%' }} />
        </div>
      </div>

      <div>
        <label className="field-label">Line items</label>
        {rows.map((r) => (
          <div key={r.id} className="doc-line">
            <input
              name="item_description"
              value={r.description}
              onChange={(e) => patch(r.id, { description: e.target.value })}
              placeholder="What are you billing for?"
            />
            <input
              name="item_qty"
              type="number"
              step="0.25"
              min={0}
              value={r.qty}
              onChange={(e) => patch(r.id, { qty: Number(e.target.value) })}
              aria-label="Quantity"
            />
            <select name="item_unit" value={r.unit} onChange={(e) => patch(r.id, { unit: e.target.value })} aria-label="Unit">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              name="item_rate"
              type="number"
              step="0.01"
              min={0}
              value={r.rate}
              onChange={(e) => patch(r.id, { rate: Number(e.target.value) })}
              aria-label="Rate"
            />
            <span className="doc-line-total mono">{money((Number(r.qty) || 0) * (Number(r.rate) || 0))}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => setRows((cur) => (cur.length === 1 ? cur : cur.filter((x) => x.id !== r.id)))}
              aria-label="Remove line"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '5px 11px' }} onClick={() => setRows((cur) => [...cur, blank(defaultRate ?? 0)])}>
          + Add line
        </button>
      </div>

      <div className="grid-2-eq">
        <div>
          <label className="field-label" htmlFor="issued_at">Issue date</label>
          <input id="issued_at" name="issued_at" type="date" style={{ width: '100%' }} />
        </div>
        <div>
          <label className="field-label" htmlFor={kind === 'invoice' ? 'due_at' : 'valid_until'}>
            {kind === 'invoice' ? 'Due date' : 'Valid until'}
          </label>
          <input
            id={kind === 'invoice' ? 'due_at' : 'valid_until'}
            name={kind === 'invoice' ? 'due_at' : 'valid_until'}
            type="date"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="grid-2-eq">
        <div>
          <label className="field-label" htmlFor="tax_pct">Tax %</label>
          <input
            id="tax_pct"
            name="tax_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxPct}
            onChange={(e) => setTaxPct(Number(e.target.value) || 0)}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={kind === 'invoice' ? 'draft' : 'draft'} style={{ width: '100%' }}>
            <option value="draft">Draft</option>
            {kind === 'invoice' ? (
              <>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </>
            ) : (
              <>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
              </>
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="notes">Notes on the document</label>
        <textarea id="notes" name="notes" rows={2} placeholder="Payment terms, scope caveats, anything the client should read" style={{ width: '100%' }} />
      </div>

      <div className="doc-total-row">
        <span className="text-muted">Subtotal <b className="mono">{money(subtotal)}</b></span>
        {taxPct > 0 && <span className="text-muted">Tax <b className="mono">{money(tax)}</b></span>}
        <span className="doc-grand">Total <b className="mono">{money(subtotal + tax)}</b></span>
      </div>

      <SubmitButton className="btn" pendingLabel="Creating…" style={{ width: 'fit-content' }}>
        Create {kind === 'invoice' ? 'invoice' : 'quotation'}
      </SubmitButton>
    </form>
  );
}
