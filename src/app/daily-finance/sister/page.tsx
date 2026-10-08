import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { getSisterEntries, getSisterMonthly } from '@/features/daily-finance/set-aside';
import { monthEndOf } from '@/features/daily-finance/queries';
import { parseMonth, parseYear, monthTitle } from '@/features/daily-finance/period';
import { PeriodNav } from '@/features/daily-finance/components/PeriodNav';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

const fmt = (n: number, ccy: string) => (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
const dayLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function SisterPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; year?: string }>;
}) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const sp = await searchParams;
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const view: 'month' | 'year' = sp.view === 'year' ? 'year' : 'month';
  const month = parseMonth(sp.month, currentMonth);
  const year = view === 'year' ? parseYear(sp.year, currentYear) : Number(month.slice(0, 4));

  const settings = await getSettings(email);
  const money = (n: number) => fmt(n, settings.targets.currency);

  const monthly = await getSisterMonthly(email, year);
  const yearTotal = monthly.reduce((n, m) => n + m.amount, 0);
  const yearCount = monthly.reduce((n, m) => n + m.count, 0);
  const entries = view === 'month' ? await getSisterEntries(email, `${month}-01`, monthEndOf(`${month}-01`)) : [];
  const monthTotal = entries.reduce((n, e) => n + e.amount, 0);
  const maxMonth = Math.max(1, ...monthly.map((m) => m.amount));

  return (
    <Shell active="daily-finance" title="Given to sister" crumb="Personal · Daily Finance">
      <div className="df-toolbar">
        <PeriodNav basePath="/daily-finance/sister" view={view} month={month} year={year} currentMonth={currentMonth} currentYear={currentYear} />
        <Link href="/daily-finance" className="link-btn" style={{ fontSize: 12 }}>← Daily Finance</Link>
      </div>

      {view === 'month' ? (
        <>
          <div className="stats" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="lbl">Given · {monthTitle(month)}</div><div className="val neg">{money(monthTotal)}</div></div>
            <div className="stat"><div className="lbl">Shares this month</div><div className="val">{entries.length}</div></div>
            <div className="stat"><div className="lbl">Given · {year} so far</div><div className="val">{money(yearTotal)}</div></div>
          </div>

          <div className="card">
            <div className="df-panel-head"><span>{monthTitle(month)}</span></div>
            {entries.length === 0 ? (
              <div className="empty">
                <div className="big">Nothing given in {monthTitle(month)}</div>
                Shares are added invoice by invoice, from the “Sister’s share” box on an invoice page.
              </div>
            ) : (
              entries.map((e) => (
                <div key={e.id} className="df-entry">
                  <span className="df-dot expense" />
                  <div className="df-entry-text">
                    <div className="df-cat">{e.note ?? 'Sister’s share'}</div>
                    <div className="df-note">
                      {dayLabel(e.date)}
                      {e.linked_invoice_id && (
                        <> · <Link href={`/billing/invoices/${e.linked_invoice_id}`} className="link-btn" style={{ fontSize: 11.5 }}>Open invoice</Link></>
                      )}
                    </div>
                  </div>
                  <span className="df-amt neg">−{money(e.amount)}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="lbl">Given · {year}</div><div className="val neg">{money(yearTotal)}</div></div>
            <div className="stat"><div className="lbl">Shares</div><div className="val">{yearCount}</div></div>
            <div className="stat">
              <div className="lbl">Average per month</div>
              <div className="val">{money(yearTotal / (year === currentYear ? Number(today.slice(5, 7)) : 12))}</div>
            </div>
          </div>

          <div className="card">
            <div className="df-panel-head"><span>Month by month — {year}</span></div>
            <div style={{ padding: 16 }}>
              {yearCount === 0 ? (
                <p className="text-muted text-sm" style={{ margin: 0 }}>Nothing given to your sister in {year}.</p>
              ) : (
                monthly.map((m) => (
                  <div key={m.month} className="df-bar-row">
                    <div className="df-bar-top">
                      <span className="name">
                        <Link href={`/daily-finance/sister?month=${m.month}`} className="link-btn" style={{ fontSize: 13 }}>{monthTitle(m.month)}</Link>
                        {m.count > 0 && <span className="text-muted" style={{ fontSize: 11.5 }}> · {m.count} {m.count === 1 ? 'share' : 'shares'}</span>}
                      </span>
                      <span className="val">{money(m.amount)}</span>
                    </div>
                    <div className="df-bar-track"><div className="df-bar-fill" style={{ width: `${(m.amount / maxMonth) * 100}%` }} /></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
      <p className="df-hint">Each share is a ledger expense taken from one invoice, so it also shows up in Daily Finance for that date.</p>
    </Shell>
  );
}
