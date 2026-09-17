export type AlertLevel = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href: string;
  daysOut: number | null;
  read: boolean;
  dismissed: boolean;
  snoozedUntil: string | null;
}

/**
 * Persisted per-alert state. The alert CONTENT is derived from live data
 * (see queries.ts) so it can never go stale; only the user's interaction
 * with it is stored — that's what survives a restart and what syncs across
 * devices once this is on Supabase.
 */
export interface AlertState {
  id: string;            // `${owner_id}:${alert_key}` so it's unique per user
  owner_id: string;
  alert_key: string;     // matches the derived alert's id
  read: boolean;
  dismissed: boolean;
  snoozed_until: string | null;
  updated_at: string;
}
