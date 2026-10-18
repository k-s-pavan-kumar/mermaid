import { ActionButton } from '@/components/ActionButton';

/**
 * Shown when invoices say "paid" but no payment is on file, so the money is
 * missing from Daily Finance and the yearly targets. One click records it.
 */
export function UnrecordedBanner({
  count, amount, action,
}: { count: number; amount: number; action: () => Promise<void> }) {
  if (count <= 0 || amount <= 0) return null;
  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--gold)', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13, maxWidth: 560 }}>
        <strong>{count} invoice{count === 1 ? ' is' : 's are'} marked paid, but no payment is recorded.</strong>{' '}
        These totals already treat {count === 1 ? 'it' : 'them'} as paid, but ₹{Math.round(amount).toLocaleString('en-IN')} has not been posted to Daily Finance, so it is also missing from your yearly targets.
      </div>
      <ActionButton
        action={action}
        className="btn-inline"
        pendingLabel="Recording…"
        confirm={`Record ₹${Math.round(amount).toLocaleString('en-IN')} as received in Daily Finance, dated when each invoice was paid (or issued)?`}
      >
        Record the payment{count === 1 ? '' : 's'}
      </ActionButton>
    </div>
  );
}
