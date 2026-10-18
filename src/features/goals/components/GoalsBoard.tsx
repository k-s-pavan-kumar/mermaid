import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { getProjects } from '@/features/projects/queries';
import { TYPE_LABEL, TYPE_ORDER } from '@/lib/project-colors';
import { getGoals, getGoalLinks } from '@/features/goals/queries';
import {
  addGoal, setGoalStatus, deleteGoal, linkProjectToGoal, createProjectForGoal, setLinkMonth, unlinkGoalProject, setGoalProgress,
} from '@/features/goals/actions';
import { GOAL_STATUS_LABEL, MONTH_NAMES, MONTH_SHORT, monthLabel } from '@/features/goals/types';
import type { Goal, GoalProject } from '@/features/goals/types';
import type { Project } from '@/features/projects/types';
import type { Tag } from '@/features/tags/types';
import type { Product } from '@/features/products/types';
import { todayIso } from '@/lib/tz/today';
import { AUDIT_STAGE_LABEL, isAuditComplete, type Audit } from '@/features/audits/types';

const STATUS: Record<string, string> = {
  idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped',
};

function MonthOptions({ blankLabel = 'Month…' }: { blankLabel?: string }) {
  return (
    <>
      <option value="">{blankLabel}</option>
      {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
    </>
  );
}

const UNITS = ['projects', 'audits', 'clients', 'students', 'games', 'books', 'apps', '₹'];
const fmtNum = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/**
 * Yearly goals for ONE scope — the general Goals page ('all': every field's
 * goals except TPN's) or a single field's page. Targets never cross fields:
 * a field's page only ever shows that field's goals, and TPN's goals are kept
 * out of the general view entirely.
 */
export type GoalsScope = { kind: 'all' } | { kind: 'field'; field: Tag } | { kind: 'product'; product: Product };

export async function GoalsBoard({
  email, year: yearParam, view: viewParam, notice, basePath, scope, fields, audits = [], products = [],
}: {
  email: string;
  year?: string;
  view?: string;
  notice?: string;
  /** The page this board sits on — forms return here and links stay on it. */
  basePath: string;
  scope: GoalsScope;
  /** Every field (tag with its own page), for the field picker and chips. */
  fields: Tag[];
  /** TPN audits to show under their goal (only passed on the TPN page). */
  audits?: Audit[];
  /** Products, so a goal on the general page can show which product it belongs to. */
  products?: Product[];
}) {
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = today.slice(0, 7);
  const parsed = Number(yearParam);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : thisYear;
  const view = viewParam === 'months' ? 'months' : 'goals';
  const sp = { notice };


  const tpnId = fields.find((f) => f.special === 'tpn')?.id ?? null;
  const inScope = (g: Goal) =>
    scope.kind === 'field' ? g.field_id === scope.field.id
    : scope.kind === 'product' ? g.product_id === scope.product.id
    : !(tpnId && g.field_id === tpnId);
  const [allGoals, projects] = await Promise.all([getGoals(email), getProjects()]);
  const scoped = allGoals.filter(inScope);
  const years = [...new Set(scoped.map((g) => g.year))];
  const goals = scoped.filter((g) => g.year === year);
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const links = await getGoalLinks(email, goals.map((g) => g.id));
  const projectById = new Map<string, Project>(projects.map((p) => [p.id, p]));
  const goalById = new Map<string, Goal>(goals.map((g) => [g.id, g]));
  // A link whose project was deleted elsewhere is simply not shown.
  const liveLinks = links.filter((l) => projectById.has(l.project_id));
  const goalIdSet = new Set(goals.map((g) => g.id));
  const boardAudits = audits.filter((a) => a.goal_id && goalIdSet.has(a.goal_id));
  const pickable = fields.filter((f) => f.special !== 'tpn');
  const fixedField = scope.kind === 'field' ? scope.field : null;
  const fixedProduct = scope.kind === 'product' ? scope.product : null;
  const productById = new Map(products.map((p) => [p.id, p]));

  const yearChips = [...new Set([...years, thisYear, thisYear + 1, year])].sort((a, b) => a - b);
  const done = goals.filter((g) => g.status === 'done').length;
  const plannedProjects = new Set(liveLinks.map((l) => l.project_id));
  const finishedProjects = [...plannedProjects].filter((id) => projectById.get(id)?.status === 'done').length;

  const href = (y: number, v: string) => `${basePath}?year=${y}${v === 'months' ? '&view=months' : ''}`;

  return (
    <>
      {sp.notice === 'type' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--gold)' }}>
          Saved — but your database doesn&apos;t accept that project type yet, so the project was created as <strong>Internal Tools</strong>. Run migration <code>009</code> (see <code>supabase/APPLY_PENDING.sql</code>) to unlock every type.
        </div>
      )}
      {sp.notice === 'project-failed' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--crimson)' }}>
          The goal was saved, but its project could not be created. Add one with <strong>New project for this goal</strong> on the goal below, or check the database migrations in <code>supabase/APPLY_PENDING.sql</code>.
        </div>
      )}

      <div className="chip-row">
        {yearChips.map((y) => <a key={y} href={href(y, view)} className={y === year ? 'active' : ''}>{y}</a>)}
      </div>

      <div className="stat-row">
        <div className="stat-box"><div className="lbl">Goals this year</div><div className="val">{goals.length}</div></div>
        <div className="stat-box"><div className="lbl">Achieved</div><div className="val" style={{ color: 'var(--sage)' }}>{done}</div></div>
        <div className="stat-box"><div className="lbl">Projects planned</div><div className="val">{plannedProjects.size}</div></div>
        <div className="stat-box"><div className="lbl">Projects done</div><div className="val">{finishedProjects}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Add a goal for {year}</h3>
        <form action={addGoal} className="form-grid" style={{ maxWidth: '100%' }}>
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="return_to" value={basePath} />
          {fixedField && <input type="hidden" name="field_id" value={fixedField.id} />}
          {fixedProduct && <input type="hidden" name="product_id" value={fixedProduct.id} />}
          <input name="title" placeholder={fixedField ? `A ${year} target for ${fixedField.name}, e.g. Launch 2 releases` : fixedProduct ? `A ${year} goal for ${fixedProduct.name}, e.g. Launch the book` : 'e.g. Ship 4 Figma plugins'} required style={{ width: '100%' }} />
          <input name="description" placeholder="Why it matters / what done looks like (optional)" style={{ width: '100%' }} />
          <div className="form-row" style={{ marginBottom: 0 }}>
            {!fixedField && !fixedProduct && (
              <select name="field_id" defaultValue="" aria-label="Field">
                <option value="">No field (general goal)</option>
                {pickable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <input name="target_value" type="number" min="0" step="any" placeholder="Yearly target (optional)" aria-label="Yearly target number" />
            <input name="unit" list="goal-units" placeholder="unit: audits, ₹, books…" aria-label="Target unit" />
            <datalist id="goal-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="create_project" />
            Also create a project for this goal automatically
          </label>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <select name="type" defaultValue="internal" aria-label="Project type">
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select name="month" aria-label="Month the project is planned for"><MonthOptions blankLabel="Month (optional)" /></select>
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add goal</SubmitButton>
          </div>
          <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
            The type and month are only used when the box above is ticked — the new project is named after the goal and placed in that month.
          </p>
        </form>
      </div>

      <div className="chip-row">
        <a href={href(year, 'goals')} className={view === 'goals' ? 'active' : ''}>By goal</a>
        <a href={href(year, 'months')} className={view === 'months' ? 'active' : ''}>By month</a>
      </div>

      {goals.length === 0 && (
        <div className="card"><div className="empty"><div className="big">No goals for {year} yet</div>Add the first one above, then plan its projects month by month.</div></div>
      )}

      {view === 'goals' && goals.map((g) => {
        const gl = liveLinks.filter((l) => l.goal_id === g.id);
        const ga = boardAudits.filter((a) => a.goal_id === g.id);
        const total = gl.length + ga.length;
        const doneCount = gl.filter((l) => projectById.get(l.project_id)?.status === 'done').length + ga.filter(isAuditComplete).length;
        const pct = total ? Math.round((doneCount / total) * 100) : 0;
        const linkedIds = new Set(gl.map((l) => l.project_id));
        const available = projects.filter((p) => !linkedIds.has(p.id));
        // Month buckets in calendar order; unplaced links last.
        const buckets = new Map<string, GoalProject[]>();
        for (const l of gl) { const k = l.month ?? 'none'; buckets.set(k, [...(buckets.get(k) ?? []), l]); }
        const keys = [...buckets.keys()].sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b)));

        return (
          <div key={g.id} className="card goal-card" style={{ marginBottom: 16, opacity: g.status === 'dropped' ? 0.65 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, textDecoration: g.status === 'done' ? 'line-through' : 'none' }}>{g.title}</div>
                {g.description && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{g.description}</div>}
                {scope.kind === 'all' && g.product_id && productById.get(g.product_id) && (
                  <a href={`/products/${g.product_id}`} className="type-badge" style={{ marginTop: 6, marginRight: 6, display: 'inline-flex', textDecoration: 'none' }}>
                    ◎ {productById.get(g.product_id)!.name}
                  </a>
                )}
                {scope.kind === 'all' && g.field_id && fieldById.get(g.field_id) && (
                  <a href={fieldById.get(g.field_id)!.special === 'tpn' ? '/tpn-audits' : `/fields/${g.field_id}`} className="type-badge"
                     style={{ marginTop: 6, display: 'inline-flex', color: fieldById.get(g.field_id)!.color, borderColor: fieldById.get(g.field_id)!.color, textDecoration: 'none' }}>
                    <span className="type-dot" style={{ background: fieldById.get(g.field_id)!.color }} />{fieldById.get(g.field_id)!.name}
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <span className={`tag ${g.status === 'done' ? 'ontrack' : g.status === 'dropped' ? 'dropped' : 'idea'}`}>{GOAL_STATUS_LABEL[g.status]}</span>
                {g.status !== 'done' && (
                  <ActionButton action={async () => { 'use server'; await setGoalStatus(g.id, 'done'); }} className="btn-link" pendingLabel="Saving…">Mark achieved</ActionButton>
                )}
                {g.status !== 'active' && (
                  <ActionButton action={async () => { 'use server'; await setGoalStatus(g.id, 'active'); }} className="btn-link" pendingLabel="Saving…">Reopen</ActionButton>
                )}
                {g.status === 'active' && (
                  <ActionButton action={async () => { 'use server'; await setGoalStatus(g.id, 'dropped'); }} className="btn-link" pendingLabel="Saving…">Drop</ActionButton>
                )}
                <ActionButton
                  action={async () => { 'use server'; await deleteGoal(g.id); }}
                  className="df-del" title="Delete goal" pendingLabel="…"
                  confirm={`Delete the goal "${g.title}"? Its projects are kept — only the link to this goal is removed.`}
                >×</ActionButton>
              </div>
            </div>

            {g.target_value ? (
              <div style={{ margin: '12px 0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="goal-bar"><span style={{ width: `${Math.min(100, Math.round(((g.progress_value ?? 0) / g.target_value) * 100))}%` }} /></div>
                  <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    <strong>{fmtNum(g.progress_value ?? 0)}</strong> / {fmtNum(g.target_value)} {g.unit ?? ''}
                  </span>
                </div>
                <form action={setGoalProgress.bind(null, g.id)} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <input type="hidden" name="return_to" value={basePath} />
                  <input name="progress_value" type="number" min="0" step="any" defaultValue={g.progress_value ?? 0} aria-label="Progress so far" style={{ width: 110, padding: '3px 6px', fontSize: 12 }} />
                  <SubmitButton className="btn-link" pendingLabel="…">Update progress</SubmitButton>
                </form>
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px' }}>
              <div className="goal-bar"><span style={{ width: `${pct}%` }} /></div>
              <span className="text-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                {total === 0 ? 'No projects or audits yet' : `${doneCount} of ${total} item${total === 1 ? '' : 's'} done`}
              </span>
            </div>

            {keys.map((k) => (
              <div key={k} style={{ marginTop: 10 }}>
                <div className="text-muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.03em', textTransform: 'uppercase' }}>{monthLabel(k === 'none' ? null : k)}</div>
                {buckets.get(k)!.map((l) => {
                  const p = projectById.get(l.project_id)!;
                  return (
                    <div key={l.id} className="list-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
                        <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <form action={setLinkMonth.bind(null, l.id)} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <select name="month" defaultValue={l.month ? l.month.slice(5, 7) : ''} aria-label={`Month for ${p.name}`} style={{ padding: '3px 6px', fontSize: 12 }}>
                            <MonthOptions blankLabel="No month" />
                          </select>
                          <SubmitButton className="btn-link" pendingLabel="…">Move</SubmitButton>
                        </form>
                        <ActionButton
                          action={async () => { 'use server'; await unlinkGoalProject(l.id); }}
                          className="df-del" title="Remove from this goal" pendingLabel="…"
                          confirm={`Remove "${p.name}" from this goal? The project itself is kept.`}
                        >×</ActionButton>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {ga.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="text-muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.03em', textTransform: 'uppercase' }}>TPN audits</div>
                {ga.map((a) => (
                  <div key={a.id} className="list-row">
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <a href="/tpn-audits" style={{ fontWeight: 600, textDecoration: 'none' }}>{a.client_name}{a.company ? ` · ${a.company}` : ''}</a>
                      <span className="tag idea">{AUDIT_STAGE_LABEL[a.stage]}</span>
                    </span>
                    <span className="text-muted" style={{ fontSize: 12 }}>{monthLabel(a.goal_month)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid-2-eq" style={{ marginTop: 14, gap: 14 }}>
              <form action={linkProjectToGoal.bind(null, g.id)} className="form-row" style={{ marginBottom: 0 }}>
                <select name="project_id" required defaultValue="" aria-label="Existing project" disabled={available.length === 0}>
                  <option value="" disabled>{available.length ? 'Add existing project…' : 'All projects already added'}</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select name="month" aria-label="Month"><MonthOptions /></select>
                <SubmitButton className="btn-ghost" pendingLabel="Adding…" disabled={available.length === 0}>Add</SubmitButton>
              </form>
              <form action={createProjectForGoal.bind(null, g.id)} className="form-row" style={{ marginBottom: 0 }}>
                <input type="hidden" name="return_to" value={basePath} />
                <input name="name" placeholder="New project for this goal" required />
                <select name="type" defaultValue="internal" aria-label="Project type">
                  {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <select name="month" aria-label="Month"><MonthOptions /></select>
                <SubmitButton className="btn-ghost" pendingLabel="Creating…">Create</SubmitButton>
              </form>
            </div>
          </div>
        );
      })}

      {view === 'months' && goals.length > 0 && (
        <div className="card" style={{ padding: '4px 18px' }}>
          {MONTH_NAMES.map((name, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const ml = liveLinks.filter((l) => l.month === key);
            return (
              <div key={key} className="list-row" style={{ alignItems: 'flex-start', background: key === thisMonth ? 'var(--pine-soft)' : undefined, margin: key === thisMonth ? '0 -18px' : undefined, padding: key === thisMonth ? '10px 18px' : undefined }}>
                <span style={{ width: 92, flexShrink: 0, fontFamily: "'Fraunces',serif", fontSize: 15 }} title={name}>
                  {MONTH_SHORT[i]}{key === thisMonth && <span className="text-muted" style={{ fontSize: 10.5, marginLeft: 6 }}>now</span>}
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ml.length === 0 && !boardAudits.some((a) => a.goal_month === key) && <span className="text-muted" style={{ fontSize: 12.5 }}>Nothing planned</span>}
                  {boardAudits.filter((a) => a.goal_month === key).map((a) => (
                    <span key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <a href="/tpn-audits" style={{ fontWeight: 600, textDecoration: 'none' }}>Audit: {a.client_name}</a>
                      <span className="tag idea">{AUDIT_STAGE_LABEL[a.stage]}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>for {goalById.get(a.goal_id!)?.title}</span>
                    </span>
                  ))}
                  {ml.map((l) => {
                    const p = projectById.get(l.project_id)!;
                    return (
                      <span key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
                        <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
                        <span className="text-muted" style={{ fontSize: 12 }}>for {goalById.get(l.goal_id)?.title}</span>
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
          {(() => {
            const unplaced = liveLinks.filter((l) => !l.month);
            if (!unplaced.length) return null;
            return (
              <div className="list-row" style={{ alignItems: 'flex-start' }}>
                <span style={{ width: 92, flexShrink: 0 }} className="text-muted">No month</span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unplaced.map((l) => {
                    const p = projectById.get(l.project_id)!;
                    return (
                      <span key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
                        <span className="text-muted" style={{ fontSize: 12 }}>for {goalById.get(l.goal_id)?.title}</span>
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
