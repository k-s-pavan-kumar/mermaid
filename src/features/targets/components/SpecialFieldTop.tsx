import { getFieldsSafe } from '@/features/tags/queries';
import { FieldProjects } from '@/features/tags/components/FieldProjects';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { getFieldCosts, loadTargetData } from '../queries';
import { fieldView } from '../view';
import { FieldTargetCards } from './FieldTargetCards';
import { AgingPanel } from './AgingPanel';
import { FieldCosts } from './FieldCosts';
import { getSessionDisplayName } from '@/lib/auth/session';
import { todayIso } from '@/lib/tz/today';

/**
 * The shared top of the TPN and Bug Bounty pages (which keep their own
 * dedicated boards below): yearly goal cards + insights, who owes you, costs,
 * and the field's projects with the "which client?" form.
 */
export async function SpecialFieldTop({ email, special }: { email: string; special: 'tpn' | 'bounty' }) {
  const field = (await getFieldsSafe(email)).find((f) => f.special === special);
  if (!field) return null;
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const [data, projects, clients, costs, sender] = await Promise.all([loadTargetData(email, year), getProjects(), getClients(email), getFieldCosts(email, year, { fieldId: field.id }), getSessionDisplayName()]);
  const view = fieldView(field.id, data, year, today);
  return (
    <div style={{ marginBottom: 24 }}>
      <FieldTargetCards name={field.name} year={year} view={view} />
      <AgingPanel receivables={view.receivables} sender={sender ?? undefined} />
      <FieldCosts fieldId={field.id} costs={costs} today={today} year={year} />
      <FieldProjects field={field} projects={projects} clients={clients} />
    </div>
  );
}
