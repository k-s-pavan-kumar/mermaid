import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { getAudits } from '@/features/audits/queries';
import { addAudit, updateAudit, setAuditStage, deleteAudit } from '@/features/audits/actions';
import { AUDIT_STAGES, AUDIT_STAGE_LABEL, auditTotals, type Audit, type AuditStage } from '@/features/audits/types';
import { getGoals } from '@/features/goals/queries';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';
import { SpecialFieldTop } from '@/features/targets/components/SpecialFieldTop';
import { MONTH_NAMES, monthLabel } from '@/features/goals/types';
import type { Goal } from '@/features/goals/types';

const inr = (n: number | null | undefined) => '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const STAGE_TAG: Record<AuditStage, string> = {
  lead: 'idea', scoping: 'idea', quoted: 'review', accepted: 'ontrack', in_progress: 'ontrack',
  report: 'ontrack', invoiced: 'review', paid: 'done', lost: 'dropped',
};

function GoalFields({ goals, audit }: { goals: Goal[]; audit?: Audit }) {
  return (
    <div className="form-row" style={{ marginBottom: 0 }}>
      <select name="goal_id" defaultValue={audit?.goal_id ?? ''} aria-label="Yearly goal">
        <option value="">No yearly goal</option>
        {goals.map((g) => <option key={g.id} value={g.id}>{g.year} — {g.title}</option>)}
      </select>
      <select name="goal_month" defaultValue={audit?.goal_month ? audit.goal_month.slice(5, 7) : ''} aria-label="Month in that goal">
        <option value="">Month…</option>
        {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
    </div>
  );
}

export default async function TpnAuditsPage({ searchParams }: { searchParams: Promise<{ stage?: string; year?: string; view?: string; notice?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const sp = await searchParams;
  const stage = AUDIT_STAGES.find((s) => s === sp.stage) ?? null;
  const [audits, allGoals, fields] = await Promise.all([getAudits(email), getGoals(email), getFieldsSafe(email)]);
  const tpn = fields.find((f) => f.special === 'tpn') ?? null;
  // TPN keeps its own goals and targets — only goals in the TPN field are offered here.
  const goals = tpn ? allGoals.filter((g) => g.field_id === tpn.id) : [];
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const totals = auditTotals(audits);
  const shown = stage ? audits.filter((a) => a.stage === stage) : audits;
  const counts = new Map<AuditStage, number>();
  for (const a of audits) counts.set(a.stage, (counts.get(a.stage) ?? 0) + 1);

  return (
    <Shell active="audits" title="TPN Audits" crumb="Workspace">
      <SpecialFieldTop email={email} special="tpn" />

      <p className="text-muted" style={{ marginTop: 0, fontSize: 13, maxWidth: 640 }}>
        Every TPN audit engagement in one place — client details, where it stands, the quote, the invoice and the payment. This page is separate from Clients and Billing, so audit money never mixes into those totals.
      </p>

      {tpn ? (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 10px' }}>TPN yearly targets</h2>
          <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath="/tpn-audits" scope={{ kind: 'field', field: tpn }} fields={fields} audits={audits} />
        </section>
      ) : (
        <div className="card" style={{ marginBottom: 14 }}>
          Yearly targets for TPN need the tags migration — run <code>supabase/APPLY_PENDING.sql</code>, then reload.
        </div>
      )}

      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 10px' }}>Audits</h2>
      <div className="stat-row">
        <div className="stat-box"><div className="lbl">Open audits</div><div className="val">{totals.active}</div></div>
        <div className="stat-box"><div className="lbl">Quoted</div><div className="val">{inr(totals.quoted)}</div></div>
        <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{inr(totals.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Received</div><div className="val" style={{ color: 'var(--sage)' }}>{inr(totals.received)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: totals.outstanding > 0 ? 'var(--crimson)' : undefined }}>{inr(totals.outstanding)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Add an audit client</h3>
        <form action={addAudit} className="form-grid" style={{ maxWidth: '100%' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <input name="client_name" placeholder="Contact name *" required />
            <input name="company" placeholder="Company / facility" />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <input name="email" type="email" placeholder="Email" />
            <input name="phone" placeholder="Phone" />
          </div>
          <input name="scope" placeholder="Scope — site, facility or what is being audited" style={{ width: '100%' }} />
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="text-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Audit date</label>
            <input name="audit_date" type="date" />
          </div>
          <GoalFields goals={goals} />
          <textarea name="notes" placeholder="Notes" rows={2} style={{ width: '100%' }} />
          <div><SubmitButton className="btn-inline" pendingLabel="Adding…">Add audit</SubmitButton></div>
        </form>
      </div>

      <div className="chip-row">
        <a href="/tpn-audits" className={stage === null ? 'active' : ''}>All ({audits.length})</a>
        {AUDIT_STAGES.map((s) => (
          <a key={s} href={`/tpn-audits?stage=${s}`} className={stage === s ? 'active' : ''}>{AUDIT_STAGE_LABEL[s]} ({counts.get(s) ?? 0})</a>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card"><div className="empty"><div className="big">{audits.length ? 'Nothing at this stage' : 'No audits yet'}</div>{audits.length ? 'Pick another stage above.' : 'Add your first audit client above.'}</div></div>
      )}

      {shown.map((a) => {
        const goal = a.goal_id ? goalById.get(a.goal_id) : undefined;
        const due = Math.max(0, (a.invoice_amount ?? 0) - a.paid_amount);
        return (
          <div key={a.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17 }}>
                  {a.client_name}{a.company && <span className="text-muted" style={{ fontSize: 13, fontFamily: 'inherit' }}> · {a.company}</span>}
                </div>
                {a.scope && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{a.scope}</div>}
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {a.audit_date && <span>Audit {a.audit_date}</span>}
                  {goal && <span>◎ {goal.title} · {monthLabel(a.goal_month)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`tag ${STAGE_TAG[a.stage]}`}>{AUDIT_STAGE_LABEL[a.stage]}</span>
                <form action={setAuditStage.bind(null, a.id)} style={{ display: 'flex', gap: 4 }}>
                  <select name="stage" defaultValue={a.stage} aria-label="Move to stage" style={{ padding: '3px 6px', fontSize: 12 }}>
                    {AUDIT_STAGES.map((s) => <option key={s} value={s}>{AUDIT_STAGE_LABEL[s]}</option>)}
                  </select>
                  <SubmitButton className="btn-link" pendingLabel="…">Move</SubmitButton>
                </form>
                <ActionButton
                  action={async () => { 'use server'; await deleteAudit(a.id); }}
                  className="df-del" title="Delete audit" pendingLabel="…"
                  confirm={`Delete the audit for ${a.client_name}? This removes its quote and invoice details too.`}
                >×</ActionButton>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5 }}>
              <span><span className="text-muted">Quote</span> {a.quote_amount != null ? inr(a.quote_amount) : '—'}{a.quote_ref ? ` (${a.quote_ref})` : ''}</span>
              <span><span className="text-muted">Invoice</span> {a.invoice_amount != null ? inr(a.invoice_amount) : '—'}{a.invoice_ref ? ` (${a.invoice_ref})` : ''}</span>
              <span><span className="text-muted">Paid</span> {inr(a.paid_amount)}</span>
              {due > 0 && <span style={{ color: 'var(--crimson)' }}>Due {inr(due)}</span>}
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>Details, quote &amp; invoice</summary>
              <form action={updateAudit.bind(null, a.id)} className="form-grid" style={{ maxWidth: '100%', marginTop: 10 }}>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input name="client_name" defaultValue={a.client_name} placeholder="Contact name *" required />
                  <input name="company" defaultValue={a.company ?? ''} placeholder="Company / facility" />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input name="email" type="email" defaultValue={a.email ?? ''} placeholder="Email" />
                  <input name="phone" defaultValue={a.phone ?? ''} placeholder="Phone" />
                </div>
                <input name="scope" defaultValue={a.scope ?? ''} placeholder="Scope" style={{ width: '100%' }} />
                <label className="text-muted" style={{ fontSize: 12 }}>Audit date <input name="audit_date" type="date" defaultValue={a.audit_date ?? ''} /></label>

                <div className="text-muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Quote</div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input name="quote_amount" type="number" min="0" step="0.01" defaultValue={a.quote_amount ?? ''} placeholder="Amount (₹)" />
                  <input name="quote_ref" defaultValue={a.quote_ref ?? ''} placeholder="Quote no." />
                  <input name="quote_sent_on" type="date" defaultValue={a.quote_sent_on ?? ''} aria-label="Quote sent on" />
                </div>

                <div className="text-muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Invoice &amp; payment</div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input name="invoice_amount" type="number" min="0" step="0.01" defaultValue={a.invoice_amount ?? ''} placeholder="Invoice amount (₹)" />
                  <input name="invoice_ref" defaultValue={a.invoice_ref ?? ''} placeholder="Invoice no." />
                  <input name="invoice_sent_on" type="date" defaultValue={a.invoice_sent_on ?? ''} aria-label="Invoice sent on" />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input name="paid_amount" type="number" min="0" step="0.01" defaultValue={a.paid_amount || ''} placeholder="Received so far (₹)" />
                  <input name="paid_on" type="date" defaultValue={a.paid_on ?? ''} aria-label="Paid on" />
                </div>

                <div className="text-muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Yearly goal</div>
                <GoalFields goals={goals} audit={a} />
                <textarea name="notes" defaultValue={a.notes ?? ''} placeholder="Notes" rows={2} style={{ width: '100%' }} />
                <div><SubmitButton className="btn-inline" pendingLabel="Saving…">Save audit</SubmitButton></div>
              </form>
            </details>
          </div>
        );
      })}
    </Shell>
  );
}
