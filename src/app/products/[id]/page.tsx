import { notFound, redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';
import { getProjects } from '@/features/projects/queries';
import { getProducts } from '@/features/products/queries';
import { addProductPiece, attachProjectToProduct, detachProject, deleteProduct } from '@/features/products/actions';
import { LANES, ROLES, productProgress, roleInfo } from '@/features/products/types';
import { LaunchPlanCard } from '@/features/launch/components/LaunchPlanCard';
import { launchPlan } from '@/features/launch/compute';
import { FieldCosts } from '@/features/targets/components/FieldCosts';
import { getFieldCosts, loadTargetData } from '@/features/targets/queries';
import { profitOf } from '@/features/targets/compute';
import { inr0 } from '@/features/targets/components/charts';
import { table } from '@/lib/data';
import { todayIso } from '@/lib/tz/today';
import type { Milestone } from '@/features/projects/types';
import type { Task } from '@/features/today/types';

const STATUS: Record<string, string> = { idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped' };

/** One product laid out in its four lanes, with its own yearly goals underneath. */
export default async function ProductPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; view?: string; notice?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;

  const product = (await getProducts(email)).find((p) => p.id === id);
  if (!product) notFound();
  const [projects, fields] = await Promise.all([getProjects(), getFieldsSafe(email)]);
  const pieces = projects.filter((p) => p.product_id === id);
  const spare = projects.filter((p) => !p.product_id);
  const pct = productProgress(pieces.map((p) => p.status));

  // Launch plan + money for this product
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const pieceIds = new Set(pieces.map((p) => p.id));
  const [milestones, tasks, targetData, costs] = await Promise.all([
    table<Milestone>('milestones').where((m) => pieceIds.has(m.project_id)),
    table<Task>('tasks').where((t) => t.owner_id === email && !!t.project_id && pieceIds.has(t.project_id)),
    loadTargetData(email, year),
    getFieldCosts(email, year, { productId: id }),
  ]);
  const plan = launchPlan(product.launch_date ?? null, today, pieces.map((p) => ({
    id: p.id, name: p.name, role: p.product_role ?? null, status: p.status,
    milestonesDone: milestones.filter((m) => m.project_id === p.id && m.occurred_on).length,
    milestonesTotal: milestones.filter((m) => m.project_id === p.id).length,
    tasksDone: tasks.filter((t) => t.project_id === p.id && t.done).length,
    tasksOpen: tasks.filter((t) => t.project_id === p.id && !t.done).length,
  })));
  const revenue = targetData.productRevenue.get(id) ?? 0;
  const money = profitOf(revenue, targetData.productCosts.get(id) ?? 0);

  return (
    <Shell active="products" title={product.name} crumb="Products"
      action={
        <ActionButton
          action={async () => { 'use server'; await deleteProduct(id); }}
          className="btn-ghost" pendingLabel="Deleting…"
          confirm={`Delete the product "${product.name}"? Its projects and goals are kept — they just stop belonging to it.`}
        >Delete product</ActionButton>
      }>
      {product.description && <p className="text-muted" style={{ marginTop: 0 }}>{product.description}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="goal-bar"><span style={{ width: `${pct}%` }} /></div>
        <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{pct}% of pieces done</span>
      </div>

      <LaunchPlanCard productId={id} plan={plan} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start', marginBottom: 14 }}>
        {LANES.map((lane) => {
          const inLane = pieces.filter((p) => lane.roles.includes(p.product_role as never));
          const laneRoles = ROLES.filter((r) => r.lane === lane.lane);
          return (
            <div key={lane.lane} className="card">
              <h3 style={{ marginBottom: 2 }}>{lane.label}</h3>
              <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>{lane.blurb}</div>
              {inLane.length === 0 && <p className="text-muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>Nothing here yet.</p>}
              {inLane.map((p) => (
                <div key={p.id} className="list-row">
                  <span style={{ minWidth: 0 }}>
                    <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
                    <div className="text-muted" style={{ fontSize: 11 }}>{roleInfo(p.product_role)?.label}</div>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
                    <ActionButton action={async () => { 'use server'; await detachProject(p.id); }} className="df-del" title="Remove from this product" pendingLabel="…"
                      confirm={`Remove "${p.name}" from this product? The project itself is kept.`}>×</ActionButton>
                  </span>
                </div>
              ))}
              {laneRoles.map((r) => (
                <form key={r.role} action={addProductPiece.bind(null, id)} style={{ marginTop: 8 }}>
                  <input type="hidden" name="role" value={r.role} />
                  <SubmitButton className="btn-link" pendingLabel="Adding…">+ New {r.label.toLowerCase()} project</SubmitButton>
                </form>
              ))}
            </div>
          );
        })}
      </div>

      {spare.length > 0 && (
        <form action={attachProjectToProduct.bind(null, id)} className="form-row" style={{ marginBottom: 24 }}>
          <select name="project_id" required defaultValue="" aria-label="Existing project">
            <option value="" disabled>Add an existing project…</option>
            {spare.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="role" defaultValue="saas" aria-label="Which piece it is">
            {ROLES.map((r) => <option key={r.role} value={r.role}>as the {r.label.toLowerCase()}</option>)}
          </select>
          <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add to product</SubmitButton>
        </form>
      )}

      <div className="insight-row" style={{ marginBottom: 14 }}>
        <div className="insight"><span className="k">Revenue {year}</span><strong>{inr0(money.revenue)}</strong><span className="text-muted">payments on this product&apos;s projects</span></div>
        <div className="insight"><span className="k">Costs</span><strong>{inr0(money.costs)}</strong></div>
        <div className="insight"><span className="k">Profit</span><strong style={{ color: money.profit >= 0 ? 'var(--sage)' : 'var(--crimson)' }}>{inr0(money.profit)}</strong>{money.marginPct !== null && <span className="text-muted">{money.marginPct}% margin</span>}</div>
      </div>
      <FieldCosts productId={id} costs={costs} today={today} year={year} />

      <section>
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 10px' }}>{product.name} — yearly goals</h2>
        <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath={`/products/${id}`}
          scope={{ kind: 'product', product }} fields={fields} />
      </section>
    </Shell>
  );
}
