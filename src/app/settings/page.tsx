import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings, getTargetsHistory } from '@/features/settings/queries';
import {
  addClock, removeClock, setHomeClock, moveClock, updateBusiness,
  addTargetsVersion, deleteTargetsVersion, addCategory, removeCategory,
} from '@/features/settings/actions';
import { CATEGORY_COLOR_CHOICES } from '@/features/settings/types';
import { todayIso } from '@/lib/tz/today';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import InstallPWAButton from '@/components/InstallPWAButton';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtTargetsSummary(t: { weekly_focus_hours: number; monthly_revenue: number; yearly_revenue: number; currency: string }): string {
  const bits: string[] = [];
  if (t.weekly_focus_hours > 0) bits.push(`${t.weekly_focus_hours}h/week`);
  if (t.monthly_revenue > 0) bits.push(`${t.currency} ${t.monthly_revenue.toLocaleString('en-IN')}/mo`);
  if (t.yearly_revenue > 0) bits.push(`${t.currency} ${t.yearly_revenue.toLocaleString('en-IN')}/yr`);
  return bits.length ? bits.join(' · ') : 'no numeric targets';
}

export default async function SettingsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const [settings, targetsHistory] = await Promise.all([
    getSettings(email),
    getTargetsHistory(email),
  ]);
  const today = todayIso();
  // The version currently in effect — same rule the Dashboard uses — so the
  // "current" badge in the history list matches what the Dashboard is
  // actually reading right now.
  const currentVersionId = targetsHistory.find((v) => v.effective_from <= today)?.id;

  return (
    <Shell active="settings" title="Settings" crumb="Workspace setup">
      <div className="section-title"><h3>Install</h3></div>
      <p className="text-muted text-sm" style={{ marginTop: -4 }}>
        Run Meridian like a native app — its own window/icon, no address bar.
      </p>
      <div className="card" style={{ maxWidth: 620 }}>
        <InstallPWAButton />
      </div>

      <div className="section-title"><h3>Clock widgets</h3></div>
      <p className="text-muted text-sm" style={{ marginTop: -4 }}>
        The strip at the top of every page. Add the zones your clients and students
        actually live in, mark one as home base, and reorder them so the ones you
        check most sit first. A zone outside 9am–7pm local is dimmed.
      </p>

      <div className="card" style={{ padding: '6px 16px', maxWidth: 620 }}>
        {settings.clocks.map((c, i) => (
          <div key={c.id} className="list-row">
            <span>
              <strong>{c.label}</strong>
              <span className="text-muted mono" style={{ fontSize: 11.5, marginLeft: 8 }}>{c.timezone}</span>
              {c.home && <span className="badge-home" style={{ marginLeft: 8 }}>home base</span>}
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <ActionButton action={async () => { 'use server'; await moveClock(c.id, -1); }} className="btn-ghost icon-btn" aria-label="Move left" title="Move left">‹</ActionButton>
              <ActionButton action={async () => { 'use server'; await moveClock(c.id, 1); }} className="btn-ghost icon-btn" aria-label="Move right" title="Move right">›</ActionButton>
              {!c.home && (
                <ActionButton action={async () => { 'use server'; await setHomeClock(c.id); }} className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }} pendingLabel="Setting…">
                  Set home
                </ActionButton>
              )}
              {i > 0 && (
                <ActionButton action={async () => { 'use server'; await removeClock(c.id); }} className="btn-link" pendingLabel="Removing…">Remove</ActionButton>
              )}
            </span>
          </div>
        ))}
      </div>

      <form action={addClock} className="form-row" style={{ marginTop: 14, maxWidth: 620 }}>
        <input name="label" placeholder="Label — e.g. Dubai, or a client's name" required />
        <TimezoneSelect name="timezone" defaultValue="Asia/Dubai" />
        <SubmitButton className="btn-inline" pendingLabel="Adding…">Add clock</SubmitButton>
      </form>

      <div className="section-title" id="targets"><h3>Targets &amp; goals</h3></div>
      <p className="text-muted text-sm" style={{ marginTop: -4 }}>
        What a good week, a good month and a good year look like in your numbers.
        These drive the rings and pace notches on the <a href="/dashboard">Dashboard</a>.
        Leave anything at <strong>0</strong> to stop tracking it — that target simply
        disappears from the Dashboard rather than showing an empty bar.
      </p>

      {targetsHistory.length > 0 && (
        <div className="card" style={{ maxWidth: 620, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>History</h3>
          <div className="targets-history-list">
            {targetsHistory.map((v) => (
              <div key={v.id} className="tv-row">
                <span className="tv-date">{v.effective_from}</span>
                <span className="tv-summary">{fmtTargetsSummary(v.targets)}</span>
                {v.id === currentVersionId && <span className="tv-current">current</span>}
                <ActionButton
                  action={async () => { 'use server'; await deleteTargetsVersion(v.id); }}
                  className="btn-link"
                  pendingLabel="Removing…"
                >
                  Remove
                </ActionButton>
              </div>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
            The Dashboard judges each week, month and year against whichever version
            was effective at the time — so a target you set for June still describes
            June, even after you&apos;ve changed it since.
          </p>
        </div>
      )}

      <form action={addTargetsVersion} className="card form-grid" style={{ maxWidth: 620 }}>
        <div>
          <label className="field-label" htmlFor="effective_from">Effective from</label>
          <input id="effective_from" name="effective_from" type="date" required
            defaultValue={today} max={today} style={{ width: '100%' }} />
          <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            Backdate this to correct what your target actually was on an earlier date,
            or leave it as today to start a new target going forward.
          </p>
        </div>

        <div className="field-group-label">Weekly</div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="weekly_focus_hours">Focused hours</label>
            <input id="weekly_focus_hours" name="weekly_focus_hours" type="number" min={0} max={168} step="0.5"
              defaultValue={settings.targets.weekly_focus_hours} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="weekly_tasks">Tasks completed</label>
            <input id="weekly_tasks" name="weekly_tasks" type="number" min={0} step="1"
              defaultValue={settings.targets.weekly_tasks} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="weekly_active_days">Days something moved (0–7)</label>
          <input id="weekly_active_days" name="weekly_active_days" type="number" min={0} max={7} step="1"
            defaultValue={settings.targets.weekly_active_days} style={{ width: '100%' }} />
          <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            A day counts if any task was finished, any focus block ran, or you had a
            meeting — the same forgiving rule the streak uses. Six is usually a kinder
            target than seven.
          </p>
        </div>

        <div className="field-group-label">Monthly</div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="monthly_focus_hours">Focused hours</label>
            <input id="monthly_focus_hours" name="monthly_focus_hours" type="number" min={0} max={744} step="1"
              defaultValue={settings.targets.monthly_focus_hours} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="monthly_tasks">Tasks completed</label>
            <input id="monthly_tasks" name="monthly_tasks" type="number" min={0} step="1"
              defaultValue={settings.targets.monthly_tasks} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="monthly_revenue">Revenue received in a month</label>
          <input id="monthly_revenue" name="monthly_revenue" type="number" min={0} step="1"
            defaultValue={settings.targets.monthly_revenue} style={{ width: '100%' }} />
        </div>

        <div className="field-group-label">The year</div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="yearly_revenue">Financial goal for the year</label>
            <input id="yearly_revenue" name="yearly_revenue" type="number" min={0} step="1"
              defaultValue={settings.targets.yearly_revenue} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="currency">Currency</label>
            <select id="currency" name="currency" defaultValue={settings.targets.currency} style={{ width: '100%' }}>
              {['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="fiscal_year_start_month">Financial year starts in</label>
          <select id="fiscal_year_start_month" name="fiscal_year_start_month"
            defaultValue={settings.targets.fiscal_year_start_month} style={{ width: '100%' }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            India&apos;s runs April to March. Getting this right matters: it decides what
            &ldquo;this year so far&rdquo; actually covers, and therefore whether you read as
            ahead of or behind pace.
          </p>
        </div>

        <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
          Only money that has actually been <strong>paid</strong> counts towards a revenue
          target. Invoiced-but-unpaid is shown beside it on the Dashboard, never folded in.
        </p>

        <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Save as a new version</SubmitButton>
      </form>

      <div className="section-title"><h3>Categories</h3></div>
      <p className="text-muted text-sm" style={{ marginTop: -4 }}>
        An alternative to bucketing the Dashboard&apos;s 24-hour pie by project type —
        define your own buckets (&ldquo;deep work&rdquo;, &ldquo;admin&rdquo;, &ldquo;learning&rdquo;) and tag
        any task with one from the Today board. A tagged task always wins over its
        project&apos;s type.
      </p>

      <div className="card" style={{ maxWidth: 620 }}>
        {settings.categories.length > 0 ? (
          <div className="category-chip-list">
            {settings.categories.map((c) => (
              <span key={c.key} className="category-chip">
                <span className="sw" style={{ background: c.color }} />
                {c.label}
                <ActionButton
                  action={async () => { 'use server'; await removeCategory(c.key); }}
                  pendingLabel="…"
                  aria-label={`Remove ${c.label}`}
                  title="Remove"
                >
                  ×
                </ActionButton>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            No custom categories yet — every task buckets by its project&apos;s type.
          </p>
        )}

        <form action={addCategory} className="form-row" style={{ gap: 10, alignItems: 'center' }}>
          <input name="label" placeholder="e.g. Deep work" required maxLength={40} style={{ maxWidth: 200 }} />
          <span className="color-swatch-row">
            {CATEGORY_COLOR_CHOICES.map((color, i) => (
              <label key={color}>
                <input type="radio" name="color" value={color} defaultChecked={i === 0} style={{ display: 'none' }}
                  className="color-radio" />
                <span className="color-swatch" style={{ background: color }} />
              </label>
            ))}
          </span>
          <SubmitButton className="btn-inline" pendingLabel="Adding…">Add category</SubmitButton>
        </form>
      </div>

      <div className="section-title"><h3>Billing profile</h3></div>
      <p className="text-muted text-sm" style={{ marginTop: -4 }}>
        Printed at the top of every quotation and invoice you generate. Fill this in
        once — documents you create before it is set will simply omit the missing parts.
      </p>

      <form action={updateBusiness} className="card form-grid" style={{ maxWidth: 620 }}>
        <div>
          <label className="field-label" htmlFor="legal_name">Business / your name</label>
          <input id="legal_name" name="legal_name" defaultValue={settings.business.legal_name} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="field-label" htmlFor="address">Address</label>
          <textarea id="address" name="address" rows={2} defaultValue={settings.business.address} style={{ width: '100%' }} />
        </div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="bemail">Email</label>
            <input id="bemail" name="email" defaultValue={settings.business.email} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" defaultValue={settings.business.phone} style={{ width: '100%' }} />
          </div>
        </div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="tax_id">GSTIN / tax id</label>
            <input id="tax_id" name="tax_id" defaultValue={settings.business.tax_id} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="default_tax_pct">Default tax %</label>
            <input id="default_tax_pct" name="default_tax_pct" type="number" min={0} max={100} step="0.01" defaultValue={settings.business.default_tax_pct} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="payment_details">Payment details</label>
          <textarea id="payment_details" name="payment_details" rows={3} defaultValue={settings.business.payment_details}
            placeholder="Bank name, account no., IFSC, UPI id — whatever clients should pay into" style={{ width: '100%' }} />
        </div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="invoice_prefix">Invoice prefix</label>
            <input id="invoice_prefix" name="invoice_prefix" defaultValue={settings.business.invoice_prefix} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="quote_prefix">Quote prefix</label>
            <input id="quote_prefix" name="quote_prefix" defaultValue={settings.business.quote_prefix} style={{ width: '100%' }} />
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
          Numbers are generated per year and per prefix — {settings.business.invoice_prefix}-2026-001, -002, and so on.
        </p>
        <div>
          <label className="field-label" htmlFor="footer_note">Footer note</label>
          <input id="footer_note" name="footer_note" defaultValue={settings.business.footer_note} style={{ width: '100%' }} />
        </div>

        <div>
          <label className="field-label" htmlFor="code_root">Code root folder</label>
          <input id="code_root" name="code_root" defaultValue={settings.code_root} placeholder="/home/you/code" className="mono" style={{ width: '100%' }} />
          <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            Where &quot;Scaffold on disk&quot; is allowed to create project folders. Leave it empty to
            disable scaffolding entirely — nothing outside this folder can ever be written,
            and it only works while the app runs on your own machine.
          </p>
        </div>

        <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Save settings</SubmitButton>
      </form>
    </Shell>
  );
}
