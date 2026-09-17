import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { addClock, removeClock, setHomeClock, moveClock, updateBusiness } from '@/features/settings/actions';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { TimezoneSelect } from '@/components/TimezoneSelect';

export default async function SettingsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const settings = await getSettings(email);

  return (
    <Shell active="settings" title="Settings" crumb="Workspace setup">
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
