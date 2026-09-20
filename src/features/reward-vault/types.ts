/**
 * Gates personal purchases behind real, verifiable work. A Need only
 * unlocks when its linked source — a project or a course — is actually
 * finished, and reaching "unlocked" still isn't permission to buy: a
 * cooldown has to pass first.
 *
 * The point is behavioral: it must be harder to unlock than to resist
 * buying, and once unlocked, harder to buy on impulse than to wait.
 */

export type NeedSourceType = 'project' | 'course';

/**
 * The 6 states the spec's own state-machine diagram actually defines and
 * transitions between. The UI section of the spec also lists a 7th pill,
 * "locked" — but no rule anywhere describes what causes a Need to enter or
 * leave it, and the reference mockup uses it inconsistently (two need rows
 * with an active, unpaid-invoice project — the textbook `in_progress` case —
 * show two different pills between them). Rather than invent an undocumented
 * trigger, `in_progress` is the one state for "linked, not yet earned",
 * shown with the mockup's amber "In progress" pill throughout.
 */
export type NeedStatus = 'in_progress' | 'cooling_off' | 'ready' | 'purchased' | 'released' | 'expired';

export interface Need {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  emoji_icon: string;
  price: number;

  source_type: NeedSourceType;
  /** project id or course id, depending on source_type. Null only for a
   *  released/expired Need awaiting relink. */
  linked_source_id: string | null;

  /**
   * Written ONLY by reconcileNeeds() — never by a direct user edit, and
   * never exposed as a field on the add/edit form. This is what keeps rule
   * "status, unlocked_at, purchased_at are never directly user-editable"
   * true in code, not just in intent.
   */
  status: NeedStatus;
  /** Mirrors the linked source's own progress while in_progress; frozen
   *  (not reset) once the Need leaves in_progress for any reason. */
  progress_pct: number;

  unlocked_at: string | null;      // set once, at in_progress → cooling_off
  cooldown_ends_at: string | null; // unlocked_at + cooldown window
  purchased_at: string | null;     // set only by the explicit "Mark purchased" action
  expires_at: string | null;       // cooldown_ends_at + expiry window

  created_at: string;
  linked_at: string; // when attached to its *current* source — matters for anti-backdating history

  /**
   * At most one pending toast, set by reconcileNeeds() the instant a
   * transition fires and cleared by the client the moment it's shown — see
   * acknowledgeNotification(). This is what makes the toast fire "exactly
   * once per transition, driven by the event" without polling or a
   * websocket: the flag simply persists until acknowledged, and a
   * reconciled page load has already set it by the time the page renders.
   */
  notify_pending: 'cooldown_started' | 'ready' | null;
}

export const NEED_ICON_CHOICES = ['🎁', '⌚', '🎧', '⌨️', '🖥️', '📷', '👟', '☕', '🎮', '📚'];
export const NEED_CATEGORY_CHOICES = ['Desk setup', 'Accessories', 'Tools', 'Focus gear', 'Home', 'Fitness', 'Other'];

/** Default friction windows — configurable, not hardcoded, since the right
 *  amount of friction is something to tune per-person. Stored per-owner in
 *  WorkspaceSettings.reward_vault (see settings/types.ts); these are just
 *  the shipped defaults for a fresh install. */
export const DEFAULT_COOLDOWN_HOURS = 48;
export const DEFAULT_EXPIRY_DAYS = 14;
/** The spend cap as a fraction of a linked project's invoice amount. */
export const DEFAULT_SPEND_CAP_PCT = 0.5;
/** A course has no invoice to cap against, so a course-linked Need's price
 *  is capped at a flat configurable maximum instead. */
export const DEFAULT_COURSE_CAP = 10_000;
