import { SubmitButton } from '@/components/SubmitButton';
import { assignInvoiceToField, setFieldShape, setFieldTarget } from '../actions';
import { WEIGHT_PRESETS, effectiveRate, nowIndex, overallProgress, pipeline, profitOf, sumMonthly, summarise } from '../compute';
import { fieldView } from '../view';
import { AgingPanel } from './AgingPanel';
import type { TargetData } from '../queries';
import { Donut, ProgressChart, SharePie, inr0 } from './charts';
import { fieldHref } from '@/features/tags/types';
import { TagIcon, iconKeyFor } from '@/features/tags/icons';

/**
 * Goals page → yearly amount targets: one target per field, and how far each
 * has come. Columns, left to right:
 *   Goal         what you want to earn this year
 *   Reached      money actually received (invoice payments, bounty payouts)
 *   Pending      goal − reached: still to earn (0 once you are over)
 *   Outstanding  already invoiced, waiting for payment
 * so "Pending" splits into Outstanding (billed, waiting) and the rest (still to bill).
 */
export function TargetsOverview({ year, today, data, sender }: { year: number; today: string; data: TargetData; sender?: string }) {
  const idx = nowIndex(year, today);
  const rows = data.fields.map((f) => {
    const view = fieldView(f.id, data, year, today);
    return { f, view, target: view.target, s: view.summary, outstanding: view.outstanding };
  });

  const unassignedTotal = data.unassigned.reduce((a, u) => a + u.amount, 0);
  const totalTarget = rows.reduce((a, r) => a + r.target, 0);
  const allMonthly = sumMonthly(rows.map((r) => r.s.monthly));
  const flat = summarise(totalTarget, allMonthly, idx);
  const planSum = sumMonthly(rows.filter((r) => r.target > 0).map((r) => r.s.pace));
  const planNow = idx >= 0 ? planSum[idx] ?? 0 : 0;
  const chartSummary = { ...flat, pace: planSum, expectedToDate: planNow, gap: Math.round((flat.reached - planNow) * 100) / 100 };
  const allRecurring = sumMonthly(rows.map((r) => r.view.recurringMonthly));
  const overall = overallProgress(rows.map((r) => ({ target: r.target, reached: r.s.reached, pending: r.s.pending, outstanding: r.outstanding })));
  const hasTargets = overall.target > 0;
  const needPerMonth = rows.reduce((a, r) => a + (r.target > 0 ? r.s.neededPerMonth ?? 0 : 0), 0);
  const allReached = rows.reduce((a, r) => a + r.s.reached, 0);
  const allOutstanding = rows.reduce((a, r) => a + r.outstanding, 0);
  const pipe = pipeline(overall.pending, overall.outstanding);

  return (
    <section id="targets" style={{ marginBottom: 26 }}>
      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 4px' }}>Yearly amount targets · {year}</h2>
      <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: 680 }}>
        <strong>Reached</strong> is money actually received, counted by the month it landed. <strong>Pending</strong> is what is still to earn to hit the goal.
        <strong> Outstanding</strong> is the part of that already invoiced and waiting for payment — the rest is still to bill.
      </p>

      <div className="tgt-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}>How far you&apos;ve come</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Donut pct={overall.pct} centre={hasTargets ? `${overall.pct}%` : '—'} sub={hasTargets ? 'of your goals' : 'set a target'} />
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <strong style={{ color: 'var(--sage)' }}>{inr0(overall.counted)}</strong> reached{hasTargets && <> of {inr0(overall.target)}</>}
          </div>
          {hasTargets && (
            <>
              <div style={{ fontSize: 13, color: overall.pending > 0 ? 'var(--crimson)' : 'var(--sage)' }}>
                {overall.pending > 0 ? `${inr0(overall.pending)} still pending` : 'Every goal reached'}
                {needPerMonth > 0 && <span className="text-muted"> · ≈ {inr0(needPerMonth)}/month</span>}
              </div>
              {overall.pending > 0 && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {inr0(overall.outstanding)} already invoiced · {pipe.stillToInvoice > 0 ? `${inr0(pipe.stillToInvoice)} still to bill` : 'nothing more to bill'}
                </div>
              )}
              {overall.over > 0 && <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>+ {inr0(overall.over)} earned beyond goals</div>}
            </>
          )}
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}>Where it came from</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SharePie slices={[...rows.map((r) => ({ name: r.f.name, color: r.f.color, value: r.s.reached })), { name: 'Not in a field', color: '#B9BCCB', value: unassignedTotal }]} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 8, fontSize: 12 }}>
            {rows.filter((r) => r.s.reached > 0).map((r) => (
              <span key={r.f.id}><span className="type-dot" style={{ background: r.f.color, margin: '0 5px 0 0' }} />{r.f.name} {inr0(r.s.reached)}</span>
            ))}
            {unassignedTotal > 0 && <span><span className="type-dot" style={{ background: '#B9BCCB', margin: '0 5px 0 0' }} />Not in a field {inr0(unassignedTotal)}</span>}
          </div>
        </div>
      </div>

      {data.unassigned.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold)' }}>
          <strong style={{ fontSize: 13 }}>{inr0(unassignedTotal)} received in {year} isn&apos;t counted in any field yet</strong>
          <p className="text-muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
            It was paid, but nothing links it to a field. Pick a field and press <strong>Assign</strong> — it moves into that field&apos;s totals right away (the invoice&apos;s project, or its client, is filed under that field).
          </p>
          {data.unassigned.slice(0, 6).map((u) => (
            <div key={u.id} className="list-row" style={{ fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
              <span>{u.href ? <a href={u.href} style={{ textDecoration: 'none', fontWeight: 600 }}>{u.label}</a> : u.label}<span className="text-muted" style={{ fontSize: 12 }}> · {u.date}</span></span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="mono">{inr0(u.amount)}</span>
                {u.invoiceId && (
                  <form action={assignInvoiceToField.bind(null, u.invoiceId)} style={{ display: 'flex', gap: 6 }}>
                    <select name="field_id" required defaultValue="" aria-label="Put in field" style={{ padding: '3px 6px', fontSize: 12 }}>
                      <option value="" disabled>Put in field…</option>
                      {data.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <SubmitButton className="btn-link" pendingLabel="…">Assign</SubmitButton>
                  </form>
                )}
              </span>
            </div>
          ))}
          {data.unassigned.length > 6 && <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>+ {data.unassigned.length - 6} more</div>}
        </div>
      )}

      <AgingPanel receivables={data.receivables} sender={sender} fieldNames={new Map(data.fields.map((f) => [f.id, f.name]))} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>All fields · received by month</strong>
          {hasTargets && chartSummary.expectedToDate > 0 && (
            <span style={{ fontSize: 12.5, color: chartSummary.gap >= 0 ? 'var(--sage)' : 'var(--crimson)' }}>
              {chartSummary.gap >= 0 ? `${inr0(chartSummary.gap)} ahead of plan` : `${inr0(-chartSummary.gap)} behind plan`}
            </span>
          )}
        </div>
        <ProgressChart s={chartSummary} label={`All fields ${year}`} recurring={allRecurring} />
      </div>

      <div className="card tgt-table">
        <div className="tgt-row head">
          <span>Field</span>
          <span className="num">Goal</span>
          <span className="num">Reached</span>
          <span className="num">Pending</span>
          <span className="num">Outstanding</span>
          <span className="set">Set yearly goal</span>
        </div>

        {rows.map(({ f, view, target, s, outstanding }) => {
          const over = target > 0 ? Math.max(0, s.reached - target) : 0;
          return (
            <div key={f.id} className="tgt-row">
              <span className="field-cell">
                <TagIcon icon={iconKeyFor(f)} color={f.color} size={17} />
                <a href={fieldHref(f)} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.name}</a>
              </span>
              <span className="num" data-label="Goal">{target > 0 ? inr0(target) : <span className="text-muted">not set</span>}</span>
              <span className="num" data-label="Reached" style={{ color: s.reached > 0 ? 'var(--sage)' : undefined }}>
                {inr0(s.reached)}
                {over > 0 && <small className="sub" style={{ color: 'var(--sage)' }}>+{inr0(over)} over goal</small>}
              </span>
              <span className="num" data-label="Pending" style={{ color: target > 0 && s.pending > 0 ? 'var(--crimson)' : undefined }}>
                {target > 0 ? (s.pending > 0 ? inr0(s.pending) : <span style={{ color: 'var(--sage)' }}>Done ✓</span>) : <span className="text-muted">—</span>}
              </span>
              <span className="num" data-label="Outstanding" style={{ color: outstanding > 0 ? 'var(--gold, #D99A18)' : undefined }}>
                {outstanding > 0 ? inr0(outstanding) : <span className="text-muted">₹0</span>}
              </span>
              <form action={setFieldTarget} className="set">
                <input type="hidden" name="field_id" value={f.id} />
                <input type="hidden" name="year" value={year} />
                <input name="amount" type="number" min="0" step="1" defaultValue={target || ''} placeholder="₹ yearly goal" aria-label={`${f.name} yearly goal`} />
                <SubmitButton className="btn-link" pendingLabel="…">Save</SubmitButton>
              </form>
              {target > 0 && (
                <div className="bar-cell">
                  <div className="goal-bar"><span style={{ width: `${s.pct}%` }} /></div>
                  <span className="text-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{s.pct}%</span>
                </div>
              )}
              {target > 0 && view.forecast && view.forecast.basis === 'run-rate' && (
                <div className="forecast-cell" style={{ color: view.forecast.onPace ? 'var(--sage)' : 'var(--crimson)' }}>
                  At this pace: {inr0(view.forecast.projected)} by December — {view.forecast.onPace ? 'on track for the goal' : `${inr0(view.forecast.shortBy)} short`}
                  {view.forecast.toBill > 0 && <span className="text-muted"> · still to bill {inr0(view.forecast.toBill)}</span>}
                </div>
              )}
              {target > 0 && (
                <details className="shape-cell">
                  <summary>Shape the plan{data.weights.has(f.id) ? ' · custom' : ''}</summary>
                  <form action={setFieldShape}>
                    <input type="hidden" name="field_id" value={f.id} />
                    <input type="hidden" name="year" value={year} />
                    <p className="text-muted" style={{ fontSize: 12, margin: '0 0 6px' }}>Not every month earns the same. Pick a shape, or give each month a weight (bigger = more of the goal expected that month).</p>
                    <select name="preset" defaultValue="" aria-label="Plan shape preset">
                      <option value="">Custom — use my numbers below</option>
                      {WEIGHT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <div className="weights">
                      {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => (
                        <label key={i}><span>{m}</span>
                          <input name={`w${i + 1}`} type="number" min="0" step="any" defaultValue={data.weights.get(f.id)?.[i] ?? 1} aria-label={`Weight for month ${i + 1}`} />
                        </label>
                      ))}
                    </div>
                    <SubmitButton className="btn-link" pendingLabel="Saving…">Save shape</SubmitButton>
                  </form>
                </details>
              )}
            </div>
          );
        })}

        {rows.length > 0 && (
          <div className="tgt-row total">
            <span>Total</span>
            <span className="num" data-label="Goal">{inr0(overall.target)}</span>
            <span className="num" data-label="Reached" style={{ color: 'var(--sage)' }}>{inr0(allReached)}</span>
            <span className="num" data-label="Pending" style={{ color: overall.pending > 0 ? 'var(--crimson)' : 'var(--sage)' }}>{inr0(overall.pending)}</span>
            <span className="num" data-label="Outstanding" style={{ color: allOutstanding > 0 ? 'var(--gold, #D99A18)' : undefined }}>{inr0(allOutstanding)}</span>
            <span className="set text-muted" style={{ fontSize: 11.5 }}>
              Pending adds each field&apos;s own shortfall — a field over its goal doesn&apos;t cover another.
            </span>
          </div>
        )}
        {rows.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No fields yet — run <code>supabase/APPLY_PENDING.sql</code>, then reload.</p>}
      </div>

      <div className="card" style={{ marginTop: 16, padding: '6px 18px 12px' }}>
        <h3 style={{ margin: '12px 0 4px' }}>Profit, time &amp; recurring by field · {year}</h3>
        <p className="text-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Profit = reached − the costs you add on each field page. Hourly rate = reached ÷ hours logged on that field&apos;s projects.
        </p>
        <div className="tgt-row head pt-row">
          <span>Field</span><span className="num">Reached</span><span className="num">Costs</span><span className="num">Profit</span><span className="num">Hours · ₹/hr</span><span className="num">Recurring / month</span>
        </div>
        {rows.map(({ f, view }) => {
          const p = profitOf(view.summary.reached, view.profit.costs);
          const rate = effectiveRate(view.summary.reached, view.minutes);
          return (
            <div key={f.id} className="tgt-row pt-row">
              <span className="field-cell"><TagIcon icon={iconKeyFor(f)} color={f.color} size={17} /><a href={fieldHref(f)} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.name}</a></span>
              <span className="num" data-label="Reached">{inr0(view.summary.reached)}</span>
              <span className="num" data-label="Costs">{p.costs > 0 ? inr0(p.costs) : <span className="text-muted">—</span>}</span>
              <span className="num" data-label="Profit" style={{ color: p.costs > 0 ? (p.profit >= 0 ? 'var(--sage)' : 'var(--crimson)') : undefined }}>{p.costs > 0 ? `${inr0(p.profit)}${p.marginPct !== null ? ` · ${p.marginPct}%` : ''}` : <span className="text-muted">—</span>}</span>
              <span className="num" data-label="Hours · ₹/hr">{view.minutes > 0 ? `${(view.minutes / 60).toLocaleString('en-IN', { maximumFractionDigits: 1 })} h${rate ? ` · ${inr0(rate)}` : ''}` : <span className="text-muted">—</span>}</span>
              <span className="num" data-label="Recurring / month">{view.mrr > 0 ? inr0(view.mrr) : <span className="text-muted">—</span>}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
