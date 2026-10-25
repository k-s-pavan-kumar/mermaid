import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { addFieldCost, deleteFieldCost } from '../actions';
import type { FieldCost } from '../queries';
import { inr0 } from './charts';

/** Business costs for one field (or product): hosting, ads, tools, printing… Subtracted from revenue to show profit. */
export function FieldCosts({ fieldId, productId, costs, today, year }: { fieldId?: string; productId?: string; costs: FieldCost[]; today: string; year: number }) {
  const total = costs.reduce((a, c) => a + c.amount, 0);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Costs · {year}</h3>
        <span className="mono" style={{ fontSize: 13 }}>{inr0(total)}</span>
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>Hosting, ads, tools, printing… so you see profit, not just revenue.</p>
      {costs.slice(0, 8).map((c) => (
        <div key={c.id} className="list-row" style={{ fontSize: 13 }}>
          <span>{c.label}<span className="text-muted" style={{ fontSize: 12 }}> · {c.date}</span></span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="mono">{inr0(c.amount)}</span>
            <ActionButton action={async () => { 'use server'; await deleteFieldCost(c.id); }} className="df-del" title="Delete cost" pendingLabel="…" confirm={`Delete "${c.label}"?`}>×</ActionButton>
          </span>
        </div>
      ))}
      {costs.length > 8 && <div className="text-muted" style={{ fontSize: 12 }}>+ {costs.length - 8} older</div>}
      <form action={addFieldCost} className="form-row" style={{ marginTop: 10, marginBottom: 0 }}>
        {fieldId && <input type="hidden" name="field_id" value={fieldId} />}
        {productId && <input type="hidden" name="product_id" value={productId} />}
        <input name="label" placeholder="e.g. Hosting, Meta ads" required maxLength={100} />
        <input name="amount" type="number" min="1" step="any" placeholder="Amount (₹)" required style={{ maxWidth: 130 }} />
        <input name="date" type="date" defaultValue={today} aria-label="Date" />
        <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add cost</SubmitButton>
      </form>
    </div>
  );
}
