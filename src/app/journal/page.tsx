import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { shiftIso, todayIso } from '@/lib/tz/today';
import { getDaySummaries, getEntriesForDate, searchEntries } from '@/features/journal/queries';
import { deleteJournalEntry, updateJournalEntry } from '@/features/journal/actions';
import { formatDayLabel, formatDayShort, formatEntryTime, parseDateParam } from '@/features/journal/logic';
import { MAX_ENTRY_CHARS, type JournalEntry } from '@/features/journal/types';
import { Composer } from '@/features/journal/components/Composer';
import { ReminderSettings } from '@/features/journal/components/ReminderSettings';

type Params = { d?: string; q?: string; focus?: string };

function EntryCard({ entry, showDate, today }: { entry: JournalEntry; showDate?: boolean; today: string }) {
  const edited = Date.parse(entry.updated_at) - Date.parse(entry.created_at) > 1000;
  return (
    <article className="journal-entry">
      <div className="journal-entry-head">
        <span className="mono journal-time">
          {showDate && <a href={`/journal?d=${entry.entry_date}`}>{formatDayLabel(entry.entry_date, today)} · </a>}
          {formatEntryTime(entry.created_at)}
          {edited && <span className="text-muted"> · edited</span>}
        </span>
        <span className="journal-entry-tools">
          <details className="journal-edit">
            <summary>Edit</summary>
            <form action={updateJournalEntry.bind(null, entry.id)}>
              <textarea name="content" rows={5} defaultValue={entry.content} maxLength={MAX_ENTRY_CHARS} required />
              <SubmitButton className="btn-inline" pendingLabel="Saving…">Save changes</SubmitButton>
            </form>
          </details>
          <form action={deleteJournalEntry.bind(null, entry.id)}>
            <SubmitButton className="btn-link" pendingLabel="Deleting…" confirm="Delete this entry?">Delete</SubmitButton>
          </form>
        </span>
      </div>
      <div className="journal-text">{entry.content}</div>
    </article>
  );
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<Params> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const sp = await searchParams;
  const today = todayIso();
  const date = parseDateParam(sp.d, today);
  const q = (sp.q ?? '').trim();

  const [days, entries, results] = await Promise.all([
    getDaySummaries(email),
    q ? Promise.resolve([] as JournalEntry[]) : getEntriesForDate(email, date),
    q ? searchEntries(email, q) : Promise.resolve([] as JournalEntry[]),
  ]);

  return (
    <Shell active="journal" title="Journal" crumb="Personal · day by day">
      <div className="grid-2 journal-grid">
        {/* ---- Left rail: find a day, search, reminders ---- */}
        <aside>
          <form method="get" action="/journal" className="journal-search">
            <input type="search" name="q" defaultValue={q} placeholder="Search all days…" aria-label="Search journal" />
          </form>

          <div className="card" style={{ padding: '12px 8px', marginTop: 12 }}>
            <h3 style={{ padding: '0 10px' }}>Days <span className="count">{days.length ? `${days.length} with notes` : ''}</span></h3>
            {days.length === 0 && <div className="text-muted text-sm" style={{ padding: '4px 10px 8px' }}>Nothing yet — your first entry starts the list.</div>}
            <nav className="journal-days">
              {days.map((d) => (
                <a key={d.date} href={`/journal?d=${d.date}`} className={!q && d.date === date ? 'active' : ''}>
                  <span className="journal-day-top">
                    <strong>{d.date === today ? 'Today' : formatDayShort(d.date)}</strong>
                    <span className="journal-count">{d.count}</span>
                  </span>
                  {d.preview && <span className="journal-preview">{d.preview}</span>}
                </a>
              ))}
            </nav>
          </div>

          <div style={{ marginTop: 12 }}>
            <ReminderSettings />
          </div>
        </aside>

        {/* ---- Main: composer + the day's log, or search results ---- */}
        <section>
          {q ? (
            <>
              <div className="day-nav">
                <span className="dlabel">{results.length} result{results.length === 1 ? '' : 's'} for “{q}”</span>
                <a href="/journal">Clear search</a>
              </div>
              {results.length === 0 && (
                <div className="card"><div className="empty"><div className="big">Nothing matches</div>Try fewer or different words.</div></div>
              )}
              {results.map((e) => <EntryCard key={e.id} entry={e} showDate today={today} />)}
            </>
          ) : (
            <>
              <div className="day-nav">
                <a href={`/journal?d=${shiftIso(date, -1)}`} aria-label="Previous day">← {formatDayShort(shiftIso(date, -1))}</a>
                <span style={{ textAlign: 'center' }}>
                  <span className="dlabel">{formatDayLabel(date, today)}</span>
                  {date !== today && <a href="/journal" style={{ display: 'block', fontSize: 12 }}>Jump to today</a>}
                </span>
                <a href={`/journal?d=${shiftIso(date, 1)}`} aria-label="Next day">{formatDayShort(shiftIso(date, 1))} →</a>
              </div>

              <form method="get" action="/journal" className="journal-jump">
                <input type="date" name="d" defaultValue={date} aria-label="Go to date" />
                <button className="btn-ghost" type="submit">Go</button>
              </form>

              <Composer date={date} autoFocus={sp.focus === '1'} />

              {entries.length === 0 ? (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="empty">
                    <img src="/mascot/idea.png" alt="" width={72} height={72} />
                    <div className="big">{date === today ? 'A clear head starts here' : 'No notes on this day'}</div>
                    Anything goes — a worry, a win, a half-formed idea. Add as many entries as you like.
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  {entries.map((e) => <EntryCard key={e.id} entry={e} today={today} />)}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
