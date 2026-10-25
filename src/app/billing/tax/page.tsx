import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { ActionButton } from '@/components/ActionButton';
import { table } from '@/lib/data';
import type { Invoice } from '@/features/billing/types';
import { fyLabel, fyOf, taxSummary } from '@/features/tax/compute';
import { setTdsMatched, type TdsCheck } from '@/features/tax/actions';
import { todayIso } from '@/lib/tz/today';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** GST collected and TDS deducted by Indian financial year, with a 26AS checklist and CSV export. */
export default async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const today = todayIso();
  const sp = await searchParams;
  const parsed = Number(sp.fy);
  const fy = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fyOf(today);

  const [invoices, clients] = await Promise.all([
    table<Invoice>('invoices').where((i) => i.owner_id === email),
    table<{ id: string; owner_id: string; name: string }>('clients').where((c) => c.owner_id === email),
  ]);
  let checks: TdsCheck[] = [];
  try { checks = await table<TdsCheck>('tds_checks').where((c) => c.owner_id === email && c.fy === fy); } catch { /* migration 024 not applied */ }
  const matched = new Set(checks.filter((c) => c.matched).map((c) => c.client_id));

  const s = taxSummary(invoices, new Map(clients.map((c) => [c.id, c.name])), fy);
  const years = [...new Set([...invoices.filter((i) => i.issued_at).map((i) => fyOf(i.issued_at!)), fyOf(today), fy])].sort((a, b) => a - b);

  return (
    <Shell active="billing" title="Tax summary" crumb="Billing"
      action={<a href={`/billing/tax/export?fy=${fy}`} className="btn-inline" style={{ textDecoration: 'none' }}>Download CSV</a>}>
      <div className="chip-row">
        {years.map((y) => <a key={y} href={`/billing/tax?fy=${y}`} className={y === fy ? 'active' : ''}>{fyLabel(y)}</a>)}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 12px', maxWidth: 680 }}>
        {fyLabel(fy)} runs April {fy} to March {fy + 1}. An invoice counts in the year it was <strong>issued</strong>; drafts are left out. Figures come from your invoices — check them against your filing before you rely on them.
      </p>

      <div className="stat-row">
        <div className="stat-box"><div className="lbl">Taxable value</div><div className="val">{inr(s.totals.taxable)}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{s.totals.invoices} invoices</div></div>
        <div className="stat-box"><div className="lbl">GST collected</div><div className="val">{inr(s.totals.gst)}</div></div>
        <div className="stat-box"><div className="lbl">TDS deducted</div><div className="val">{inr(s.totals.tds)}</div></div>
        <div className="stat-box"><div className="lbl">Total billed</div><div className="val">{inr(s.totals.billed)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '6px 18px 12px' }}>
        <h3 style={{ margin: '12px 0 8px' }}>By month</h3>
        <div className="tgt-row head tax-row"><span>Month</span><span className="num">Invoices</span><span className="num">Taxable</span><span className="num">GST</span><span className="num">TDS</span><span className="num">Billed</span></div>
        {s.months.map((m) => (
          <div key={m.month} className="tgt-row tax-row" style={{ opacity: m.invoices ? 1 : 0.5 }}>
            <span>{MONTH[Number(m.month.slice(5, 7)) - 1]} {m.month.slice(0, 4)}</span>
            <span className="num" data-label="Invoices">{m.invoices}</span><span className="num" data-label="Taxable">{inr(m.taxable)}</span>
            <span className="num" data-label="GST">{inr(m.gst)}</span><span className="num" data-label="TDS">{inr(m.tds)}</span><span className="num" data-label="Billed">{inr(m.billed)}</span>
          </div>
        ))}
        <div className="tgt-row total tax-row">
          <span>Total</span><span className="num">{s.totals.invoices}</span><span className="num">{inr(s.totals.taxable)}</span><span className="num">{inr(s.totals.gst)}</span><span className="num">{inr(s.totals.tds)}</span><span className="num">{inr(s.totals.billed)}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>By quarter</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {s.quarters.map((q) => (
            <div key={q.label} className="insight" style={{ display: 'block' }}>
              <div className="k">{q.label}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>GST <strong>{inr(q.gst)}</strong></div>
              <div style={{ fontSize: 13 }}>TDS <strong>{inr(q.tds)}</strong></div>
              <div className="text-muted" style={{ fontSize: 11.5 }}>on {inr(q.taxable)} taxable</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>TDS by client — match against Form 26AS</h3>
        <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
          Tick each client once the TDS they deducted shows up in your 26AS for {fyLabel(fy)}. Anything unticked is TDS you may not get credit for — chase the client to file it.
        </p>
        {s.byClient.filter((c) => c.tds > 0).length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No TDS deducted in this year.</p>}
        {s.byClient.filter((c) => c.tds > 0).map((c) => {
          const ok = c.clientId ? matched.has(c.clientId) : false;
          return (
            <div key={c.clientId ?? 'none'} className="list-row">
              <span><strong>{c.name}</strong><span className="text-muted" style={{ fontSize: 12.5 }}> · {c.invoices} invoice{c.invoices === 1 ? '' : 's'} · billed {inr(c.billed)}</span></span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <strong className="mono">{inr(c.tds)}</strong>
                {c.clientId ? (
                  <ActionButton
                    action={async () => { 'use server'; await setTdsMatched(c.clientId!, fy, !ok); }}
                    className={ok ? 'tag ontrack' : 'btn-link'} pendingLabel="…"
                  >{ok ? 'Matched in 26AS ✓' : 'Mark matched'}</ActionButton>
                ) : <span className="text-muted" style={{ fontSize: 12 }}>no client</span>}
              </span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
