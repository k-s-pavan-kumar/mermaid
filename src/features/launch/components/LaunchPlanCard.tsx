import { SubmitButton } from '@/components/SubmitButton';
import { setLaunchDate } from '@/features/products/actions';
import type { LaunchPlan } from '../compute';

const VERDICT: Record<LaunchPlan['verdict'], { label: string; tag: string }> = {
  'no-date': { label: 'No launch date yet', tag: 'idea' },
  launched: { label: 'Everything is done', tag: 'done' },
  late: { label: 'Past the launch date', tag: 'risk' },
  'at-risk': { label: 'At risk', tag: 'risk' },
  'on-track': { label: 'On track', tag: 'ontrack' },
};

/** Launch plan for a product: date, countdown, how ready each piece is, and what is blocking launch. */
export function LaunchPlanCard({ productId, plan }: { productId: string; plan: LaunchPlan }) {
  const v = VERDICT[plan.verdict];
  const d = plan.daysToLaunch;
  const countdown = d === null ? null : d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : d === 0 ? 'today' : `${-d} day${d === -1 ? '' : 's'} ago`;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Launch plan</h3>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {plan.launchDate ? <>Launch <strong>{plan.launchDate}</strong> · {countdown}</> : 'Set a date and Meridian tracks how ready every piece is.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`tag ${v.tag}`}>{v.label}</span>
          <form action={setLaunchDate.bind(null, productId)} style={{ display: 'flex', gap: 6 }}>
            <input type="date" name="launch_date" defaultValue={plan.launchDate ?? ''} aria-label="Launch date" />
            <SubmitButton className="btn-ghost" pendingLabel="Saving…">Set date</SubmitButton>
          </form>
        </div>
      </div>

      {plan.pieces.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 6px' }}>
            <div className="goal-bar"><span style={{ width: `${plan.overall}%` }} /></div>
            <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{plan.overall}% ready overall</span>
          </div>
          {plan.pieces.map((p) => (
            <div key={p.id} className="list-row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 0 }}>
                <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
                <span className="text-muted" style={{ fontSize: 11.5 }}>
                  {' '}· {p.milestonesTotal > 0 ? `${p.milestonesDone}/${p.milestonesTotal} milestones` : 'no milestones'} · {p.tasksDone + p.tasksOpen > 0 ? `${p.tasksDone}/${p.tasksDone + p.tasksOpen} tasks` : 'no tasks'}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
                <div className="goal-bar" style={{ width: 90 }}><span style={{ width: `${p.readiness}%`, background: p.blocked ? 'var(--crimson)' : undefined }} /></div>
                <span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{p.readiness}%</span>
              </span>
              {p.reason && <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--crimson)' }}>⚠ {p.reason}</div>}
            </div>
          ))}
        </>
      )}
      {plan.blockers.length > 0 && plan.verdict !== 'launched' && (
        <p style={{ fontSize: 12.5, margin: '10px 0 0', color: 'var(--crimson)' }}>
          Blocking launch: {plan.blockers.map((b) => b.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
