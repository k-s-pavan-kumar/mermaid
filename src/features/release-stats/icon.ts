import type { Platform } from './types';

// Icon helpers for Release Stats cards. Pure and dependency-free so both the
// server actions and the client picker can import them (and so the verify
// script can test them without Next).

/** What a new product gets when you don't pick one — distinct per platform, so a
 *  board of products doesn't open as a wall of identical boxes. */
export const DEFAULT_ICONS: Record<Platform, string> = {
  npm: '📦',
  pypi: '🐍',
  github: '🐙',
  vscode_marketplace: '💻',
  figma_plugin: '🎨',
  snapchat_lens: '👻',
  chrome_web_store: '🧩',
  saas: '🚀',
};

export function defaultIconFor(platform: Platform): string {
  return DEFAULT_ICONS[platform] ?? '📦';
}

/** The first user-perceived character. Emoji are often several code points
 *  (flags, skin tones, 👨‍💻 = man + joiner + laptop), so slicing by length or by
 *  code point would cut them in half. */
export function firstGrapheme(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    for (const part of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) return part.segment;
  }
  return Array.from(s)[0] ?? ''; // very old runtimes: code point is the best we can do
}

/** Whatever the form sent → one clean icon. Blank or missing keeps `fallback`.
 *  Letters and symbols are allowed on purpose (a one-letter monogram is a fine icon). */
export function normalizeIcon(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  return firstGrapheme(raw) || fallback;
}

/** Curated choices for the picker. Anything else can be typed or pasted. */
export const ICON_CHOICES: { label: string; icons: string[] }[] = [
  { label: 'Dev & tools', icons: ['📦', '🧩', '🔌', '🛠️', '⚙️', '💻', '🖥️', '⌨️', '🧪', '🔧', '🧰', '📚', '🐍', '🐙'] },
  { label: 'Design & creative', icons: ['🎨', '✏️', '🖌️', '🖼️', '📐', '🧵', '✨', '🌈', '🎬', '🎵', '📸', '🎭'] },
  { label: 'Social & fun', icons: ['👻', '🎮', '🕶️', '🪄', '🦄', '🐝', '🦊', '🍀'] },
  { label: 'Business & growth', icons: ['🚀', '💼', '📈', '💡', '🧭', '⭐', '🔥', '💎', '🏆', '🎯', '💰', '🔔'] },
  { label: 'Other', icons: ['🌱', '🌍', '☁️', '⚡', '🔒', '🛡️', '📱', '🧠'] },
];
