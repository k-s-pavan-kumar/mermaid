import Link from 'next/link';
import { monthTitle, shiftMonth } from '../period';

/**
 * Month | Year switch + ‹ prev  label  next › + "This month". Everything is a
 * plain link (the period lives in the URL), so it works the same on every page
 * that uses it and survives a refresh.
 */
export function PeriodNav({
  basePath, view, month, year, currentMonth, currentYear,
}: {
  basePath: string;
  view: 'month' | 'year';
  month: string;
  year: number;
  currentMonth: string;
  currentYear: number;
}) {
  const monthHref = (ym: string) => (ym === currentMonth ? basePath : `${basePath}?month=${ym}`);
  const yearHref = (y: number) => `${basePath}?view=year${y === currentYear ? '' : `&year=${y}`}`;

  const prev = view === 'month' ? monthHref(shiftMonth(month, -1)) : yearHref(year - 1);
  const nextDisabled = view === 'month' ? month >= currentMonth : year >= currentYear;
  const next = view === 'month' ? monthHref(shiftMonth(month, 1)) : yearHref(year + 1);
  const label = view === 'month' ? monthTitle(month) : String(year);
  const atNow = view === 'month' ? month === currentMonth : year === currentYear;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div className="df-toggle">
        <Link href={monthHref(month)} className={view === 'month' ? 'active' : ''}>Month</Link>
        <Link href={yearHref(year)} className={view === 'year' ? 'active' : ''}>Year</Link>
      </div>
      <div className="df-nav">
        <Link href={prev} className="arrow" aria-label={view === 'month' ? 'Previous month' : 'Previous year'}>‹</Link>
        <span className="label">{label}</span>
        {nextDisabled
          ? <span className="arrow off" aria-hidden>›</span>
          : <Link href={next} className="arrow" aria-label={view === 'month' ? 'Next month' : 'Next year'}>›</Link>}
        {!atNow && (
          <Link href={view === 'month' ? basePath : yearHref(currentYear)} className="link-btn" style={{ fontSize: 12, marginLeft: 6 }}>
            {view === 'month' ? 'This month' : 'This year'}
          </Link>
        )}
      </div>
    </div>
  );
}
