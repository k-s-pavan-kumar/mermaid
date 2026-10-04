import { table } from '@/lib/data';
import type { JournalEntry } from './types';
import { latestActivity, matchesQuery, summariseDays } from './logic';

// Both data stores filter in memory (see supabase-store.ts), so each helper
// fetches the owner's rows once and derives what it needs. A journal grows by
// a handful of rows a day — thousands a year — which is comfortably small.

async function ownerEntries(ownerId: string): Promise<JournalEntry[]> {
  return table<JournalEntry>('journal_entries').where((e) => e.owner_id === ownerId);
}

/** One day's entries, newest first (the composer sits above the list). */
export async function getEntriesForDate(ownerId: string, date: string): Promise<JournalEntry[]> {
  const rows = (await ownerEntries(ownerId)).filter((e) => e.entry_date === date);
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Days that have entries, newest first, for the rail. */
export async function getDaySummaries(ownerId: string, limit = 45) {
  return summariseDays(await ownerEntries(ownerId), limit);
}

/** Entries across every day whose text contains all the words in `query`. */
export async function searchEntries(ownerId: string, query: string, limit = 60): Promise<JournalEntry[]> {
  const rows = (await ownerEntries(ownerId)).filter((e) => matchesQuery(e.content, query));
  return rows
    .sort((a, b) => (a.entry_date === b.entry_date ? (a.created_at < b.created_at ? 1 : -1) : a.entry_date < b.entry_date ? 1 : -1))
    .slice(0, limit);
}

/** When the user last wrote or edited an entry — drives "skip the reminder if I just wrote". */
export async function getLastActivityAt(ownerId: string): Promise<string | null> {
  return latestActivity(await ownerEntries(ownerId));
}
