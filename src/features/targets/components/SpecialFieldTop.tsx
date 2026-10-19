import { getFieldsSafe } from '@/features/tags/queries';
import { FieldProjects } from '@/features/tags/components/FieldProjects';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { loadTargetData } from '../queries';
import { nowIndex, summarise } from '../compute';
import { FieldTargetCards } from './FieldTargetCards';
import { todayIso } from '@/lib/tz/today';

/**
 * The shared top of the TPN and Bug Bounty pages (which keep their own
 * dedicated boards below): yearly goal / reached / pending cards and the
 * field's projects with the "which client?" form.
 */
export async function SpecialFieldTop({ email, special }: { email: string; special: 'tpn' | 'bounty' }) {
  const field = (await getFieldsSafe(email)).find((f) => f.special === special);
  if (!field) return null;
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const [data, projects, clients] = await Promise.all([loadTargetData(email, year), getProjects(), getClients(email)]);
  const s = summarise(data.targets.get(field.id) ?? 0, data.monthly.get(field.id) ?? Array.from({ length: 12 }, () => 0), nowIndex(year, today));
  return (
    <div style={{ marginBottom: 24 }}>
      <FieldTargetCards name={field.name} year={year} s={s} outstanding={data.outstanding.get(field.id) ?? 0} />
      <FieldProjects field={field} projects={projects} clients={clients} />
    </div>
  );
}
