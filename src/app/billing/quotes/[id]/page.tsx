import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getQuoteById } from '@/features/billing/queries';
import { setDocStatus, convertQuoteAndOpen } from '@/features/billing/actions';
import { getClientById } from '@/features/clients/queries';
import { getSettings } from '@/features/settings/queries';
import { table } from '@/lib/data';
import { DocumentView } from '@/features/billing/components/DocumentView';
import { PrintButton } from '@/features/billing/components/PrintButton';
import { ActionButton } from '@/components/ActionButton';
import type { Project } from '@/features/projects/types';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) notFound();

  const [settings, client, project] = await Promise.all([
    getSettings(email),
    quote.client_id ? getClientById(quote.client_id) : Promise.resolve(undefined),
    quote.project_id ? table<Project>('projects').find(quote.project_id) : Promise.resolve(undefined),
  ]);

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <a href="/billing" className="btn-ghost" style={{ textDecoration: 'none' }}>‹ Billing</a>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {quote.status === 'draft' && (
            <ActionButton action={async () => { 'use server'; await setDocStatus('quote', quote.id, 'sent'); }} className="btn-ghost" pendingLabel="Saving…">
              Mark sent
            </ActionButton>
          )}
          <ActionButton action={async () => { 'use server'; await convertQuoteAndOpen(quote.id); }} className="btn-ghost" pendingLabel="Converting…">
            Convert to invoice
          </ActionButton>
          <PrintButton />
        </span>
      </div>

      <DocumentView doc={quote} kind="quote" business={settings.business} client={client} projectName={project?.name} />

      <p className="doc-hint">
        Use your browser&apos;s print dialog → <b>Save as PDF</b> for a file to email. Accepting it
        later is one click: <b>Convert to invoice</b> copies every line across.
      </p>
    </div>
  );
}
