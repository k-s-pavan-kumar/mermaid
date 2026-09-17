export interface Meeting {
  id: string;
  owner_id: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  /** ISO timestamp — meetings are a point in time, not a date, because the
   *  whole point of the clock strip is that your clients are not in IST. */
  starts_at: string;
  duration_mins: number;
  location: string | null;
  attendees: string | null;
  /** Agenda before, minutes after — same field, because in practice you
   *  type the agenda then edit it into notes during the call. */
  notes: string | null;
  follow_up: string | null;
  created_at: string;
}
