import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { getTags } from '@/features/tags/queries';
import { addTag, deleteTag, mergeTag, renameTag, setTagIcon, setTagIsField } from '@/features/tags/actions';
import { IconPicker, TagIcon, iconKeyFor } from '@/features/tags/icons';
import { TAG_COLORS, fieldHref, type Tag } from '@/features/tags/types';

/**
 * The one place tags are made. A tag appears wherever a label is needed
 * (client "Type of work", goals, projects). Tick "own page" and it becomes a
 * Field: a sidebar page with its own yearly targets.
 */
export default async function TagsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  let tags: Tag[] = [];
  let missing = false;
  try { tags = await getTags(email); } catch { missing = true; }
  const fields = tags.filter((t) => t.is_field);
  const plain = tags.filter((t) => !t.is_field);

  const row = (t: Tag) => (
    <div key={t.id} className="list-row" style={{ flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TagIcon icon={iconKeyFor(t)} color={t.color} size={18} />
        <span style={{ fontWeight: 600 }}>{t.name}</span>
        {t.special === 'tpn' && <span className="tag idea">TPN · own goals &amp; page</span>}
        {t.special === 'bounty' && <span className="tag idea">Bug bounty · own pipeline page</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {t.is_field && <a href={fieldHref(t)} className="btn-link" style={{ textDecoration: 'none' }}>Open page</a>}
        {!t.special && (
          <ActionButton action={async () => { 'use server'; await setTagIsField(t.id, !t.is_field); }} className="btn-link" pendingLabel="…">
            {t.is_field ? 'Make plain tag' : 'Give it a page'}
          </ActionButton>
        )}
        {!t.special && (
          <ActionButton
            action={async () => { 'use server'; await deleteTag(t.id); }} className="df-del" title="Delete tag" pendingLabel="…"
            confirm={`Delete the tag "${t.name}"? Goals and projects keep existing — they just lose this field. Clients keep the label on their record.`}
          >×</ActionButton>
        )}
      </span>
      <details style={{ flexBasis: '100%', margin: '2px 0 6px 26px' }}>
        <summary className="text-muted" style={{ cursor: 'pointer', fontSize: 12 }}>Edit · icon, rename{t.special ? '' : ', merge'}</summary>
        <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
          <form action={setTagIcon.bind(null, t.id)}>
            <IconPicker defaultValue={iconKeyFor(t)} color={t.color} />
            <SubmitButton className="btn-link" pendingLabel="Saving…">Save icon</SubmitButton>
          </form>
          <form action={renameTag.bind(null, t.id)} className="form-row" style={{ marginBottom: 0 }}>
            <input name="name" defaultValue={t.name} maxLength={30} required aria-label={`New name for ${t.name}`} />
            <SubmitButton className="btn-ghost" pendingLabel="Renaming…">Rename everywhere</SubmitButton>
          </form>
          {!t.special && (
            <form action={mergeTag.bind(null, t.id)} className="form-row" style={{ marginBottom: 0 }}>
              <select name="into" required defaultValue="" aria-label={`Merge ${t.name} into`}>
                <option value="" disabled>Merge “{t.name}” into…</option>
                {tags.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <SubmitButton className="btn-ghost" pendingLabel="Merging…">Merge</SubmitButton>
            </form>
          )}
          <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
            Rename updates every client that carries the tag. Merge moves clients, goals and projects to the other tag, then removes this one.
          </p>
        </div>
      </details>
    </div>
  );

  return (
    <Shell active="tags" title="Tags & Fields" crumb="Workspace setup">
      {missing && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--crimson)' }}>
          The tags table isn&apos;t in your database yet. Run <code>supabase/APPLY_PENDING.sql</code> in the Supabase SQL editor, then reload.
        </div>
      )}
      <p className="text-muted" style={{ marginTop: 0, fontSize: 13, maxWidth: 660 }}>
        Make a tag once and it is offered everywhere — the client form&apos;s <em>Type of work</em>, goals and projects. Give a tag its own page and it becomes a <strong>Field</strong> in the sidebar with its own yearly targets, so SaaS, Gaming, Publishing and the rest stay out of each other&apos;s way.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Add a tag</h3>
        <form action={addTag} className="form-grid" style={{ maxWidth: '100%' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <input name="name" placeholder="e.g. Photography, Mobile game, Book" maxLength={30} required />
            <select name="color" defaultValue={TAG_COLORS[0]} aria-label="Colour">
              {TAG_COLORS.map((c, i) => <option key={c} value={c} style={{ color: c }}>● Colour {i + 1}</option>)}
            </select>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Pick an icon</div>
            <IconPicker defaultValue="tag" />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="is_field" defaultChecked />
            Create a page for it — it appears in the sidebar with its own projects and yearly target
          </label>
          <div><SubmitButton className="btn-inline" pendingLabel="Adding…">Add tag</SubmitButton></div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: '4px 18px' }}>
        <h3 style={{ marginTop: 14 }}>Fields (own page)</h3>
        {fields.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No fields yet.</p>}
        {fields.map(row)}
      </div>

      <div className="card" style={{ padding: '4px 18px' }}>
        <h3 style={{ marginTop: 14 }}>Tags</h3>
        {plain.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No plain tags yet — add one above, or from a client&apos;s <em>Type of work</em>.</p>}
        {plain.map(row)}
      </div>
    </Shell>
  );
}
