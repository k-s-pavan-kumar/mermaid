import type { Tag } from './types';

/** Circle as path data, so every icon is just a list of paths. */
const circ = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0`;

export interface TagIconDef { key: string; label: string; paths: string[] }

/** The icons a tag can use. Keys are what is stored; add to the end, never rename. */
export const TAG_ICONS: TagIconDef[] = [
  { key: 'cloud', label: 'SaaS / cloud', paths: ['M6.5 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.6 9.2a4.7 4.7 0 0 0-.1 9.3z'] },
  { key: 'code', label: 'Code', paths: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5l-3 14'] },
  { key: 'gamepad', label: 'Gaming', paths: ['M6 8h12a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.2 2.2L14.5 14h-5l-1.3 1.7A3.5 3.5 0 0 1 2 13.5V12a4 4 0 0 1 4-4z', 'M7 11v3', 'M5.5 12.5h3', 'M16 11.5h.01', 'M18 13h.01'] },
  { key: 'book', label: 'Book', paths: ['M4 4.5v15A1.5 1.5 0 0 1 5.5 18H20V3H5.5A1.5 1.5 0 0 0 4 4.5z', 'M8 7h8', 'M8 10.5h5', 'M5.5 18A1.5 1.5 0 0 0 4 19.5 1.5 1.5 0 0 0 5.5 21H20v-3'] },
  { key: 'shield', label: 'Audit / security', paths: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z', 'M8.5 12l2.5 2.5L15.5 10'] },
  { key: 'bug', label: 'Bug bounty', paths: ['M9.5 6.5a2.5 2.5 0 0 1 5 0V9h-5z', 'M8 9h8v6a4 4 0 0 1-8 0z', 'M5 8.5l3 1.5', 'M19 8.5L16 10', 'M4 14h4', 'M16 14h4', 'M5.5 19.5L8 17', 'M18.5 19.5L16 17'] },
  { key: 'megaphone', label: 'Marketing', paths: ['M4 10v4h3l7 4V6L7 10z', 'M17.5 9.5a3.5 3.5 0 0 1 0 5'] },
  { key: 'cap', label: 'Teaching', paths: ['M2 9l10-5 10 5-10 5z', 'M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5'] },
  { key: 'briefcase', label: 'Client work', paths: ['M4 8h16v11H4z', 'M9 8V6h6v2', 'M4 13h16'] },
  { key: 'rocket', label: 'Launch', paths: ['M12 3c3 2.5 4.5 5.5 4.5 9L14 15h-4l-2.5-3C7.5 8.5 9 5.5 12 3z', 'M10 15l-1.5 3.5', 'M14 15l1.5 3.5', 'M12 9.5h.01'] },
  { key: 'bolt', label: 'Fast / energy', paths: ['M13 3L5 13h6l-1 8 8-10h-6z'] },
  { key: 'chart', label: 'Analytics', paths: ['M4 4v16h16', 'M8 16v-4', 'M12 16V8', 'M16 16v-6'] },
  { key: 'coin', label: 'Money', paths: [circ(12, 12, 9), 'M9 9.7c0-1 1.3-1.7 3-1.7s3 .7 3 1.7-1.3 1.5-3 1.9-3 .9-3 1.9 1.3 1.8 3 1.8 3-.8 3-1.8', 'M12 6.5V8', 'M12 16v1.5'] },
  { key: 'cart', label: 'Store', paths: ['M4 5h2l2 11h10l2-8H7', circ(9.5, 19.3, 1.2), circ(16.5, 19.3, 1.2)] },
  { key: 'globe', label: 'Web', paths: [circ(12, 12, 9), 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'] },
  { key: 'cpu', label: 'Hardware / AI', paths: ['M7 7h10v10H7z', 'M10 10h4v4h-4z', 'M9 3v4', 'M15 3v4', 'M9 17v4', 'M15 17v4', 'M3 9h4', 'M3 15h4', 'M17 9h4', 'M17 15h4'] },
  { key: 'palette', label: 'Design', paths: ['M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.2-.4-1.2.4-2.3 1.7-2.3H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z', 'M7.5 11h.01', 'M10 7.5h.01', 'M14.5 7.5h.01'] },
  { key: 'pen', label: 'Writing', paths: ['M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z', 'M14.5 6.5l3 3'] },
  { key: 'camera', label: 'Photo', paths: ['M4 8h3l1.5-2h7L17 8h3v11H4z', circ(12, 13.5, 3.2)] },
  { key: 'video', label: 'Video', paths: ['M3 7h12v10H3z', 'M15 11l6-3v8l-6-3'] },
  { key: 'music', label: 'Music', paths: ['M9 18V6l10-2v12', circ(6.5, 18, 2.5), circ(16.5, 16, 2.5)] },
  { key: 'flask', label: 'Research', paths: ['M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3'] },
  { key: 'leaf', label: 'Growth', paths: ['M5 19c0-8 5-14 15-14 0 10-6 15-14 15', 'M5 19c3-4 6-6 10-8'] },
  { key: 'heart', label: 'Community', paths: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'] },
  { key: 'star', label: 'Favourite', paths: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z'] },
  { key: 'home', label: 'Home', paths: ['M4 11l8-7 8 7v9H4z', 'M10 20v-6h4v6'] },
  { key: 'tag', label: 'Tag', paths: ['M3 12V4h8l10 10-8 8z', circ(7.5, 8.5, 1.3)] },
];

export const ICON_KEYS = TAG_ICONS.map((i) => i.key);
const BY_KEY = new Map(TAG_ICONS.map((i) => [i.key, i]));

export const isIconKey = (k: string) => BY_KEY.has(k);

/** A sensible icon from the tag's name, for tags that haven't had one chosen. */
export function defaultIconFor(t: Pick<Tag, 'name' | 'special'>): string {
  if (t.special === 'tpn') return 'shield';
  if (t.special === 'bounty') return 'bug';
  const n = t.name.toLowerCase();
  if (n.includes('saas')) return 'cloud';
  if (n.includes('gam')) return 'gamepad';
  if (n.includes('book') || n.includes('publish')) return 'book';
  if (n.includes('market')) return 'megaphone';
  if (n.includes('teach') || n.includes('educat') || n.includes('learn')) return 'cap';
  if (n.includes('client')) return 'briefcase';
  if (n.includes('app')) return 'rocket';
  if (n.includes('design')) return 'palette';
  return 'tag';
}

export function iconKeyFor(t: Pick<Tag, 'name' | 'special' | 'icon'>): string {
  return t.icon && isIconKey(t.icon) ? t.icon : defaultIconFor(t);
}

/** The tag's icon, drawn in its colour. */
export function TagIcon({ icon, color, size = 18 }: { icon: string; color?: string; size?: number }) {
  const def = BY_KEY.get(icon) ?? BY_KEY.get('tag')!;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color, flexShrink: 0 }}>
      {def.paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Radio grid of icons. Posts the chosen key as `name` (default "icon"). */
export function IconPicker({ name = 'icon', defaultValue, color }: { name?: string; defaultValue: string; color?: string }) {
  return (
    <div className="icon-pick" role="radiogroup" aria-label="Icon">
      {TAG_ICONS.map((i) => (
        <label key={i.key} title={i.label}>
          <input type="radio" name={name} value={i.key} defaultChecked={i.key === defaultValue} />
          <span><TagIcon icon={i.key} color={color} size={20} /></span>
        </label>
      ))}
    </div>
  );
}
