'use client';

import { useState } from 'react';
import type { BillingType } from '../types';

/**
 * How this client pays: one fixed project cost, or a monthly retainer
 * (e.g. digital-marketing clients billed every month). Only the fields for the
 * chosen type are rendered, so only those are posted — the server clears the
 * other type's fields.
 */
export function BillingFields({
  initial,
}: {
  initial?: {
    billing_type?: BillingType | null;
    project_cost?: number | null;
    monthly_fee?: number | null;
    retainer_start?: string | null;
    retainer_due_day?: number | null;
  };
}) {
  const [type, setType] = useState<BillingType>(initial?.billing_type === 'monthly' ? 'monthly' : 'project');

  return (
    <div className="form-grid" style={{ maxWidth: '100%' }}>
      <div>
        <label className="field-label" htmlFor="billing_type">How do they pay?</label>
        <select id="billing_type" name="billing_type" value={type} onChange={(e) => setType(e.target.value as BillingType)} style={{ width: '100%' }}>
          <option value="project">One project — total project cost</option>
          <option value="monthly">Monthly retainer (e.g. digital marketing)</option>
        </select>
      </div>

      {type === 'project' ? (
        <div>
          <label className="field-label" htmlFor="project_cost">Total project cost (₹)</label>
          <input id="project_cost" name="project_cost" type="number" min={0} step="1" defaultValue={initial?.project_cost ?? ''}
            placeholder="e.g. 50000 — fixed price for the whole project" style={{ width: '100%' }} />
        </div>
      ) : (
        <>
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="monthly_fee">Monthly fee (₹)</label>
              <input id="monthly_fee" name="monthly_fee" type="number" min={0} step="1" defaultValue={initial?.monthly_fee ?? ''}
                placeholder="e.g. 15000" required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="retainer_due_day">Due on day of month</label>
              <input id="retainer_due_day" name="retainer_due_day" type="number" min={1} max={28} step="1"
                defaultValue={initial?.retainer_due_day ?? 5} style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="retainer_start">First month billed</label>
            <input id="retainer_start" name="retainer_start" type="month" required
              defaultValue={initial?.retainer_start ? initial.retainer_start.slice(0, 7) : new Date().toISOString().slice(0, 7)}
              style={{ width: '100%' }} />
            <div className="text-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
              Every month from here is expected. After the due day, a month you haven&apos;t marked received shows as overdue.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
