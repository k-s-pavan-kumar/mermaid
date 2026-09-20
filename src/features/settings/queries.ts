import { table } from '@/lib/data';
import {
  DEFAULT_BUSINESS, DEFAULT_CLOCKS, DEFAULT_TARGETS, DEFAULT_CATEGORIES, DEFAULT_REWARD_VAULT,
  type WorkspaceSettings, type Targets, type TargetsVersion,
} from './types';

/**
 * Settings are read on every page (the clock strip is in the shell), so this
 * never throws and never returns undefined — a missing row just means
 * "defaults", which keeps a fresh install from erroring before you've been
 * anywhere near a settings screen.
 */
export async function getSettings(ownerId: string): Promise<WorkspaceSettings> {
  const rows = await table<WorkspaceSettings>('settings').where((s) => s.owner_id === ownerId);
  const found = rows[0];
  const history = await getTargetsHistory(ownerId);

  return {
    id: found?.id ?? `set_${ownerId}`,
    owner_id: ownerId,
    clocks: found?.clocks?.length ? found.clocks : DEFAULT_CLOCKS,
    business: { ...DEFAULT_BUSINESS, ...(found?.business ?? {}) },
    categories: found?.categories ?? DEFAULT_CATEGORIES,
    reward_vault: { ...DEFAULT_REWARD_VAULT, ...(found?.reward_vault ?? {}) },
    // "Current" targets is a read-time snapshot of the history as of today,
    // not a stored value — see pickTargets(). Historical, per-period lookups
    // (what applied back in June) go through the dashboard queries, which
    // call pickTargets() directly against a past date.
    targets: pickTargets(history, todayFallback()),
    code_root: found?.code_root ?? '',
  };
}

// Today's date without importing the tz helper here, to keep this module
// free of a dependency edge that only the dashboard otherwise needs; the
// dashboard always calls pickTargets() with its own home-timezone todayIso().
function todayFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

/** All targets versions for this owner, most recent `effective_from` first. */
export async function getTargetsHistory(ownerId: string): Promise<TargetsVersion[]> {
  const rows = await table<TargetsVersion>('targets_history').where((v) => v.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0));
}

/**
 * The targets that applied on `dateIso` — the newest version whose
 * `effective_from` is not after that date. This is what makes "what was my
 * target back in June" answerable: pass June's date and get June's targets,
 * even if three newer versions have been added since.
 *
 * Sorts defensively rather than trusting the caller to have already sorted
 * `history` newest-first — `getTargetsHistory()` does sort that way, but a
 * silently wrong answer from passing it in whatever order it happened to be
 * fetched is a much worse failure mode than the cost of one extra sort here.
 *
 * If every version is dated after `dateIso` (asking about a time before any
 * target was ever set), the honest answer is "no target existed yet", so
 * this returns the all-zero DEFAULT_TARGETS rather than guessing.
 */
export function pickTargets(history: TargetsVersion[], dateIso: string): Targets {
  const applicable = [...history]
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0))
    .find((v) => v.effective_from <= dateIso);
  return applicable ? { ...DEFAULT_TARGETS, ...applicable.targets } : DEFAULT_TARGETS;
}
