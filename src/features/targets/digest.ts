/** Weekly digest as plain text — pure, so the wording is tested and can be pasted anywhere. */
export interface DigestInput {
  weekLabel: string;
  receivedThisWeek: number;
  payments: { label: string; amount: number }[];
  fields: { name: string; target: number; reached: number; pct: number; onPace: boolean | null; toBill: number }[];
  chasing: { number: string; who: string; owed: number; daysLate: number }[];
  comingUp: string[];
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function digestText(d: DigestInput): string {
  const L: string[] = [`Meridian — ${d.weekLabel}`, ''];
  L.push(`Received this week: ${inr(d.receivedThisWeek)}`);
  for (const p of d.payments.slice(0, 8)) L.push(`  • ${p.label} — ${inr(p.amount)}`);
  L.push('', 'Yearly targets');
  const withGoal = d.fields.filter((f) => f.target > 0);
  if (withGoal.length === 0) L.push('  No yearly goals set yet.');
  for (const f of withGoal) {
    const pace = f.onPace === null ? '' : f.onPace ? ' · on pace' : ' · behind pace';
    L.push(`  • ${f.name}: ${inr(f.reached)} of ${inr(f.target)} (${f.pct}%)${pace}${f.toBill > 0 ? ` · still to bill ${inr(f.toBill)}` : ''}`);
  }
  L.push('', 'Chase these');
  if (d.chasing.length === 0) L.push('  Nothing overdue. 🎉');
  for (const c of d.chasing.slice(0, 8)) L.push(`  • ${c.number}${c.who ? ` · ${c.who}` : ''} — ${inr(c.owed)}${c.daysLate > 0 ? `, ${c.daysLate}d late` : ''}`);
  if (d.comingUp.length) { L.push('', 'Coming up'); for (const x of d.comingUp.slice(0, 10)) L.push(`  • ${x}`); }
  return L.join('\n');
}
