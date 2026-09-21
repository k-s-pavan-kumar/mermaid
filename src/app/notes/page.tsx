import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getNotes } from '@/features/notes/queries';
import { createNote, deleteNote, getNoteContent, syncVault, getOrphanedNotes } from '@/features/notes/actions';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { vaultAvailable } from '@/lib/vault/local-vault';
import { Shell } from '@/components/Shell';
import { SkillPanel } from '@/features/assistant/components/SkillPanel';
import { skillCards } from '@/features/assistant/skills';
import { runSkillAction } from '@/features/assistant/actions';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { note: activeNoteId } = await searchParams;
  const notes = await getNotes(email);
  const projects = await getProjects();
  const clients = await getClients(email);

  const byFolder = new Map<string, typeof notes>();
  for (const n of notes) {
    const folder = n.vault_path.split('/')[0] ?? 'Notes';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(n);
  }

  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) : undefined;
  const activeContent = activeNote ? await getNoteContent(activeNote.id) : null;
  const orphans = await getOrphanedNotes();

  const syncAction = (
    <form action={async () => { 'use server'; await syncVault(); }}>
      <button type="submit" className="btn-ghost">Sync vault</button>
    </form>
  );

  return (
    <Shell active="notes" title="Notes & SOPs" crumb="Workspace" action={syncAction}>
      <div className="sync-bar">
        {vaultAvailable() ? (
          <span>
            Notes live as <code>.md</code> files in <code>vault/</code>. Edit them here or in Obsidian —
            hit <strong>Sync vault</strong> to pull in anything written on the Obsidian side.
          </span>
        ) : (
          <span>Notes are stored in your database. (Obsidian vault sync is only available when Meridian runs on your own machine.)</span>
        )}
      </div>

      {orphans.length > 0 && (
        <div className="sync-bar warn-bar">
          <span>
            <strong>{orphans.length} note{orphans.length > 1 ? 's' : ''}</strong> in the index have no file in the
            vault ({orphans.map((o) => o.title).join(', ')}). Meridian never deletes these automatically —
            the file may have been moved or renamed in Obsidian.
          </span>
        </div>
      )}

      <SkillPanel
        title="Write it for me"
        intro="Pick a project and a skill — the long ones generate section by section and land in the vault as a real .md file you can edit here or in Obsidian."
        skills={skillCards('notes')}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        run={runSkillAction}
      />

      <div className="grid-2" style={{ marginTop: 22 }}>
        <div>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--sage)', marginBottom: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sage)', display: 'inline-block' }} />
              vault/ — open this folder in Obsidian for the graph
            </div>

            {notes.length === 0 && <div className="text-muted text-sm">No notes yet.</div>}
            {Array.from(byFolder.entries()).map(([folder, folderNotes]) => (
              <div key={folder} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>📁 {folder}</div>
                {folderNotes.map((n) => (
                  <a key={n.id} href={`/notes?note=${n.id}`}
                    style={{
                      display: 'block', padding: '5px 0 5px 20px', fontSize: 13, textDecoration: 'none',
                      color: activeNoteId === n.id ? 'var(--pine)' : '#555',
                      fontWeight: activeNoteId === n.id ? 600 : 400,
                    }}>
                    📄 {n.title}
                  </a>
                ))}
              </div>
            ))}
          </div>

          <div className="section-title"><h3>New note</h3></div>
          <form action={createNote} className="form-grid">
            <input name="title" placeholder="Title *" required />
            <input name="tags" placeholder="Tags, comma separated" />
            <select name="project_id" defaultValue="">
              <option value="">No project link</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select name="client_id" defaultValue="">
              <option value="">No client link</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <textarea name="content" placeholder="Write the note…" rows={5} />
            <button type="submit" className="btn" style={{ width: 'fit-content' }}>Save note</button>
          </form>
        </div>

        <div>
          {!activeNote ? (
            <div className="card"><div className="empty"><div className="big">No note selected</div>Pick one from the vault to preview it.</div></div>
          ) : (
            <div className="card" style={{ padding: '24px 28px' }}>
              <div className="item-row">
                <div>
                  <h2 style={{ marginBottom: 2, fontSize: 22 }}>{activeNote.title}</h2>
                  <div className="mono text-muted" style={{ fontSize: 11.5 }}>vault/{activeNote.vault_path}</div>
                </div>
                <form action={async () => { 'use server'; await deleteNote(activeNote.id); }}>
                  <button type="submit" className="btn-link">Delete</button>
                </form>
              </div>

              {activeNote.tags.length > 0 && (
                <div style={{ margin: '12px 0' }}>
                  {activeNote.tags.map((t) => (
                    <span key={t} style={{ fontSize: 11, background: 'var(--pine-soft)', color: 'var(--pine)', padding: '3px 9px', borderRadius: 5, marginRight: 6 }}>#{t}</span>
                  ))}
                </div>
              )}

              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.65, background: '#FAFBF9', padding: 14, borderRadius: 8, border: '1px solid var(--border-light)', marginTop: 12 }}>
                {activeContent}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
