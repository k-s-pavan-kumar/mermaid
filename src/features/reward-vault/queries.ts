import { table } from '@/lib/data';
import { getSourceSnapshot, type SourceSnapshot } from './source';
import type { ProjectStatusLogEntry } from '@/features/projects/types';
import type { Need } from './types';
import { DEFAULT_COOLDOWN_HOURS, DEFAULT_EXPIRY_DAYS } from './types';

export interface NeedWithSource extends Need {
  source: SourceSnapshot | null;
}

/**
 * Advance every Need's state machine to where it should be *right now*,
 * persisting any transition, then return the reconciled rows. This is the
 * "on-read lazy evaluation" the spec explicitly allows in place of a
 * scheduled job — there's nowhere to run a cron in this deployment, so
 * every page load (and a few mutating actions) calls this instead of
 * trusting a possibly-stale `status` column.
 *
 * Nothing here is a user edit: every write in this function is the state
 * machine advancing itself off a timer or off the linked source's own
 * current state, exactly as the spec requires.
 */
export async function reconcileNeeds(
  ownerId: string,
  cooldownHours = DEFAULT_COOLDOWN_HOURS,
  expiryDays = DEFAULT_EXPIRY_DAYS
): Promise<NeedWithSource[]> {
  const needs = await table<Need>('needs').where((n) => n.owner_id === ownerId);
  const now = Date.now();
  const out: NeedWithSource[] = [];

  for (const need of needs) {
    let n = need;
    const source = n.linked_source_id ? await getSourceSnapshot(n.source_type, n.linked_source_id) : null;

    if (n.status === 'in_progress' && source) {
      // Rule 5: a dropped project immediately releases whatever it's linked
      // to, regardless of progress. progress_pct freezes at its current
      // value for history but won't count toward the next attempt.
      if (source.isDropped) {
        n = await persist(n.id, { status: 'released', linked_source_id: null });
      } else if (source.satisfiesUnlock) {
        // Rule 1 + 2: both conditions together start the cooldown timer,
        // never a purchase directly.
        const unlockedAt = new Date(now).toISOString();
        const cooldownEndsAt = new Date(now + cooldownHours * 3_600_000).toISOString();
        n = await persist(n.id, {
          status: 'cooling_off',
          unlocked_at: unlockedAt,
          cooldown_ends_at: cooldownEndsAt,
          progress_pct: 100,
          notify_pending: 'cooldown_started',
        });
      } else {
        // Still locked in — keep its progress mirror current.
        if (source.progressPct !== n.progress_pct) {
          n = await persist(n.id, { progress_pct: source.progressPct });
        }
      }
    } else if (n.status === 'cooling_off' && n.cooldown_ends_at && now >= Date.parse(n.cooldown_ends_at)) {
      // Rule 2: nothing but the clock can do this.
      const expiresAt = new Date(Date.parse(n.cooldown_ends_at) + expiryDays * 86_400_000).toISOString();
      n = await persist(n.id, { status: 'ready', expires_at: expiresAt, notify_pending: 'ready' });
    } else if (n.status === 'ready' && n.expires_at && now >= Date.parse(n.expires_at)) {
      // Rule 6: earned permission doesn't sit around indefinitely.
      n = await persist(n.id, {
        status: 'expired', linked_source_id: null, unlocked_at: null, cooldown_ends_at: null,
      });
    } else if (n.status === 'in_progress' && !source && n.linked_source_id) {
      // The linked project/course was deleted out from under the Need —
      // treat it the same as a drop rather than leaving a dangling link.
      n = await persist(n.id, { status: 'released', linked_source_id: null });
    }

    out.push({ ...n, source: n.linked_source_id ? await getSourceSnapshot(n.source_type, n.linked_source_id) : null });
  }

  return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

async function persist(id: string, patch: Partial<Need>): Promise<Need> {
  const updated = await table<Need>('needs').update(id, patch);
  if (!updated) throw new Error(`Need ${id} vanished mid-reconciliation`);
  return updated;
}

export async function getAuditLog(ownerId: string, limit = 50): Promise<ProjectStatusLogEntry[]> {
  const rows = await table<ProjectStatusLogEntry>('project_status_log').where((r) => r.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1)).slice(0, limit);
}

/** Project ids / course ids currently occupied by an active Need — rule 4,
 *  one active need per source. "Active" here means in_progress or
 *  cooling_off; a released/expired/purchased Need doesn't occupy anything. */
export function occupiedSourceIds(needs: Need[], sourceType: 'project' | 'course'): Set<string> {
  return new Set(
    needs
      .filter((n) => n.source_type === sourceType && (n.status === 'in_progress' || n.status === 'cooling_off') && n.linked_source_id)
      .map((n) => n.linked_source_id!)
  );
}

export interface VaultStats {
  totalValueTracked: number;
  purchased: number;
  coolingOff: number;
}

export function vaultStats(needs: Need[]): VaultStats {
  return {
    totalValueTracked: needs.filter((n) => n.status !== 'purchased').reduce((s, n) => s + n.price, 0),
    purchased: needs.filter((n) => n.status === 'purchased').length,
    coolingOff: needs.filter((n) => n.status === 'cooling_off').length,
  };
}

/** Needs eligible for a relink right now (released or expired) — offered
 *  as an optional pairing when adding a course. */
export async function getRelinkableNeeds(ownerId: string): Promise<{ id: string; name: string }[]> {
  const needs = await table<Need>('needs').where((n) => n.owner_id === ownerId && (n.status === 'released' || n.status === 'expired'));
  return needs.map((n) => ({ id: n.id, name: n.name }));
}
