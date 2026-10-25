import type { TargetData } from './queries';
import { effectiveRate, forecast, nowIndex, profitOf, recentMonthlyAverage, summariseShaped, type Receivable } from './compute';

const zeros = () => Array.from({ length: 12 }, () => 0);
const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

/** Everything one field's page needs, derived from the loaded data — pure, so it is tested. */
export function fieldView(fieldId: string, data: TargetData, year: number, today: string) {
  const idx = nowIndex(year, today);
  const target = data.targets.get(fieldId) ?? 0;
  const summary = summariseShaped(target, data.monthly.get(fieldId) ?? zeros(), idx, data.weights.get(fieldId));
  const outstanding = data.outstanding.get(fieldId) ?? 0;
  const recurringMonthly = data.recurring.get(fieldId) ?? zeros();
  const costTotal = sum(data.costs.get(fieldId) ?? zeros());
  const minutes = data.minutes.get(fieldId) ?? 0;
  const receivables: Receivable[] = data.receivables.filter((r) => r.fieldId === fieldId).sort((a, b) => b.daysLate - a.daysLate);
  return {
    target, summary, outstanding,
    forecast: target > 0 ? forecast(target, summary.reached, outstanding, year, today) : null,
    recurringMonthly, recurringTotal: sum(recurringMonthly), mrr: recentMonthlyAverage(recurringMonthly, idx),
    profit: profitOf(summary.reached, costTotal), minutes, rate: effectiveRate(summary.reached, minutes),
    receivables,
  };
}
