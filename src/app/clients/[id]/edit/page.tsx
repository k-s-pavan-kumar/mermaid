import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getClientById } from '@/features/clients/queries';
import { updateClient } from '@/features/clients/actions';
import { Shell } from '@/components/Shell';
import { TimezoneSelect } from '@/components/TimezoneSelect';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const client = await getClientById(id);
  if (!client || client.owner_id !== email) notFound();

  const updateWithId = updateClient.bind(null, id);

  return (
    <Shell active="clients" title="Edit client" crumb="Workspace · Clients">
      <form action={updateWithId} className="form-grid">
        <input name="name" defaultValue={client.name} required />
        <input name="company" defaultValue={client.company ?? ''} placeholder="Company / role" />
        <input name="email" type="email" defaultValue={client.email ?? ''} placeholder="Email" />
        <TimezoneSelect defaultValue={client.timezone} />
        <textarea name="notes" defaultValue={client.notes ?? ''} rows={3} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn">Save</button>
          <a href="/clients" className="btn-ghost" style={{ display: 'inline-block', textDecoration: 'none', padding: '9px 18px' }}>Cancel</a>
        </div>
      </form>
    </Shell>
  );
}
