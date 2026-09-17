import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getInvoiceById } from '@/features/billing/queries';
import { markInvoicePaid, setDocStatus } from '@/features/billing/actions';
import { getClientById } from '@/features/clients/queries';
import { getSettings } from '@/features/settings/queries';
import { table } from '@/lib/data';
import { DocumentView } from '@/features/billing/components/DocumentView';
import { PrintButton } from '@/features/billing/components/PrintButton';
import { ActionButton } from '@/components/ActionButton';
import type { Project } from '@/features/projects/types';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const [settings, client, project] = await Promise.all([
    getSettings(email),
    invoice.client_id ? getClientById(invoice.client_id) : Promise.resolve(undefined),
    invoice.project_id ? table<Project>('projects').find(invoice.project_id) : Promise.resolve(undefined),
  ]);

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <a href="/billing" className="btn-ghost" style={{ textDecoration: 'none' }}>‹ Billing</a>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {invoice.status !== 'paid' && (
            <ActionButton action={async () => { 'use server'; await markInvoicePaid(invoice.id); }} className="btn-ghost" pendingLabel="Saving…">
              Mark paid
            </ActionButton>
          )}
          {invoice.status === 'draft' && (
            <ActionButton action={async () => { 'use server'; await setDocStatus('invoice', invoice.id, 'pending'); }} className="btn-ghost" pendingLabel="Sending…">
              Mark sent
            </ActionButton>
          )}
          <PrintButton />
        </span>
      </div>

      <DocumentView doc={invoice} kind="invoice" business={settings.business} client={client} projectName={project?.name} />

      <p className="doc-hint">
        Use your browser&apos;s print dialog → <b>Save as PDF</b> for a file to email. Margins and
        page breaks are already set up for A4.
      </p>
    </div>
  );
}
