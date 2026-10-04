export interface JournalEntry {
  id: string;
  owner_id: string;
  /** The day this entry belongs to, 'YYYY-MM-DD' in the home timezone. */
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** One row in the "Days" rail: a day that has at least one entry. */
export interface DaySummary {
  date: string;
  count: number;
  /** First line of the most recent entry that day, trimmed for the rail. */
  preview: string;
}

/** Backstop for the textarea's maxLength — a journal entry, not a manuscript. */
export const MAX_ENTRY_CHARS = 20000;
