import { AGING_LABEL, agingTotals, reminderText, type AgingBucket, type Receivable } from '../compute';
import { CopyButton } from './CopyButton';
import { inr0 } from './charts';

const BUCKET_COLOR: Record<AgingBucket, string> = { notdue: 'var(--sage)', d30: 'var(--gold, #D99A18)', d60: 'var(--rust, #DE7438)', d60plus: 'var(--crimson)' };

/**
 * Who still owes you, oldest first, by how late. Each row has a ready-to-send
 * reminder message (plain text, copies in one click).
 */
export function AgingPanel({
  receivables, title = 'Who owes you', sender, fieldNames,
}: { receivables: Receivable[]; title?: string; sender?: string; fieldNames?: Map<string, string> }) {
  if (receivables.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Nothing outstanding — every invoice is paid. 🎉</p>
      </div>
    );
  }
  const totals = agingTotals(receivables);
  const rows = [...receivables].sort((a, b) => b.daysLate - a.daysLate).slice(0, 12);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => (
          <span key={b} className="tag" style={{ borderColor: BUCKET_COLOR[b], color: BUCKET_COLOR[b], opacity: totals[b].count ? 1 : 0.45 }}>
            {AGING_LABEL[b]} · {totals[b].count} · {inr0(totals[b].amount)}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="list-row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0 }}>
            {r.href ? <a href={r.href} style={{ fontWeight: 600, textDecoration: 'none' }}>{r.number}</a> : <strong>{r.number}</strong>}
            {r.who && <span className="text-muted" style={{ fontSize: 12.5 }}> · {r.who}</span>}
            {fieldNames && r.fieldId && fieldNames.get(r.fieldId) && <span className="text-muted" style={{ fontSize: 11.5 }}> · {fieldNames.get(r.fieldId)}</span>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: BUCKET_COLOR[r.bucket] }}>
              {r.daysLate > 0 ? `${r.daysLate}d late` : r.due ? `due ${r.due}` : 'not due'}
            </span>
            <strong className="mono" style={{ fontSize: 13 }}>{inr0(r.owed)}</strong>
            <CopyButton text={reminderText(r, sender)} label="Copy reminder" done="Reminder copied" />
          </span>
        </div>
      ))}
      {receivables.length > rows.length && <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>+ {receivables.length - rows.length} more</div>}
    </div>
  );
}
