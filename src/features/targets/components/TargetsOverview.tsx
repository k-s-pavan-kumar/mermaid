import { SubmitButton } from '@/components/SubmitButton';
import { setFieldTarget } from '../actions';
import { nowIndex, summarise, sumMonthly } from '../compute';
import type { TargetData } from '../queries';
import { Donut, ProgressChart, SharePie, inr0 } from './charts';
import { fieldHref } from '@/features/tags/types';

/**
 * Goals page → yearly amount targets: one target per field, and how far each
 * has come. The rings, pie and chart are all drawn from received money.
 */
export function TargetsOverview({ year, today, data }: { year: number; today: string; data: TargetData }) {
  const idx = nowIndex(year, today);
  const rows = data.fields.map((f) => {
    const monthly = data.monthly.get(f.id) ?? Array.from({ length: 12 }, () => 0);
    const target = data.targets.get(f.id) ?? 0;
    return { f, target, s: summarise(target, monthly, idx) };
  });

  const totalTarget = rows.reduce((a, r) => a + r.target, 0);
  const totalMonthly = sumMonthly(rows.map((r) => r.s.monthly));
  const all = summarise(totalTarget, totalMonthly, idx);
  const hasTargets = totalTarget > 0;

  return (
    <section id="targets" style={{ marginBottom: 26 }}>
      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 4px' }}>Yearly amount targets · {year}</h2>
      <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: 660 }}>
        Set what you want to earn in each field this year. &ldquo;Reached&rdquo; is money actually received — invoice payments and bounty payouts — counted by the month it landed, so these update as you get paid.
      </p>

      <div className="tgt-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}>How far you&apos;ve come</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Donut pct={hasTargets ? all.pct : 0} centre={hasTargets ? `${all.pct}%` : '—'} sub={hasTargets ? 'of yearly goal' : 'set a target'} />
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <strong style={{ color: 'var(--sage)' }}>{inr0(all.reached)}</strong> reached{hasTargets && <> of {inr0(all.target)}</>}
          </div>
          {hasTargets && (
            <div style={{ fontSize: 13, color: all.pending > 0 ? 'var(--crimson)' : 'var(--sage)' }}>
              {all.pending > 0 ? `${inr0(all.pending)} still to complete` : 'Every target reached'}
              {all.neededPerMonth ? <span className="text-muted"> · ≈ {inr0(all.neededPerMonth)}/month</span> : null}
            </div>
          )}
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}>Where it came from</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SharePie slices={rows.map((r) => ({ name: r.f.name, color: r.f.color, value: r.s.reached }))} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 8, fontSize: 12 }}>
            {rows.filter((r) => r.s.reached > 0).map((r) => (
              <span key={r.f.id}><span className="type-dot" style={{ background: r.f.color, margin: '0 5px 0 0' }} />{r.f.name} {inr0(r.s.reached)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>All fields · received by month</strong>
          {hasTargets && all.expectedToDate > 0 && (
            <span style={{ fontSize: 12.5, color: all.gap >= 0 ? 'var(--sage)' : 'var(--crimson)' }}>
              {all.gap >= 0 ? `${inr0(all.gap)} ahead of plan` : `${inr0(-all.gap)} behind plan`}
            </span>
          )}
        </div>
        <ProgressChart s={all} label={`All fields ${year}`} />
      </div>

      <div className="card">
        <div className="tgt-row head">
          <span>Field</span><span className="num">Goal</span><span className="num">Reached</span><span className="num">Pending</span><span>Set goal</span>
        </div>
        {rows.map(({ f, target, s }) => (
          <div key={f.id} className="tgt-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="type-dot" style={{ background: f.color, margin: 0 }} />
              <a href={fieldHref(f)} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.name}</a>
            </span>
            <span className="num">{target > 0 ? inr0(target) : '—'}</span>
            <span className="num" style={{ color: 'var(--sage)' }}>{inr0(s.reached)}</span>
            <span className="num" style={{ color: target > 0 && s.pending > 0 ? 'var(--crimson)' : undefined }}>{target > 0 ? inr0(s.pending) : '—'}</span>
            <form action={setFieldTarget} style={{ display: 'flex', gap: 6 }}>
              <input type="hidden" name="field_id" value={f.id} />
              <input type="hidden" name="year" value={year} />
              <input name="amount" type="number" min="0" step="1" defaultValue={target || ''} placeholder="₹ yearly goal" aria-label={`${f.name} yearly goal`} style={{ width: 120, padding: '4px 8px', fontSize: 12.5 }} />
              <SubmitButton className="btn-link" pendingLabel="…">Save</SubmitButton>
            </form>
            {target > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="goal-bar"><span style={{ width: `${s.pct}%` }} /></div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No fields yet — run <code>supabase/APPLY_PENDING.sql</code>, then reload.</p>}
      </div>
    </section>
  );
}
