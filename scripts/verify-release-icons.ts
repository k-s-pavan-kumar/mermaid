// npm run verify:icons
//
// Release Stats icons: the pure helpers (defaults, grapheme-safe cleanup, the
// curated choices) and the picker's rendered output. The server actions that
// save icons are exercised end to end against a running app (see README).

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_ICONS, ICON_CHOICES, defaultIconFor, firstGrapheme, normalizeIcon } from '../src/features/release-stats/icon';
import { PLATFORMS } from '../src/features/release-stats/types';
import { IconPicker } from '../src/features/release-stats/components/IconPicker';

// tsx compiles JSX with the classic transform (the project's tsconfig says `jsx: preserve`
// for Next's own compiler), which wants React in scope. Only this script needs the shim.
(globalThis as unknown as { React: typeof React }).React = React;

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; process.exitCode = 1; } else console.log('ok  :', msg);
}
function eq<T>(actual: T, expected: T, msg: string) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) console.error(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  assert(same, msg);
}

console.log('-- defaults');
assert(PLATFORMS.every((p) => typeof DEFAULT_ICONS[p] === 'string' && DEFAULT_ICONS[p].length > 0), 'every platform has a default icon');
eq(defaultIconFor('figma_plugin'), '🎨', 'Figma plugins default to 🎨');
eq(defaultIconFor('chrome_web_store'), '🧩', 'Chrome extensions default to 🧩');
eq(defaultIconFor('snapchat_lens'), '👻', 'Snapchat lenses default to 👻');
eq(defaultIconFor('saas'), '🚀', 'SaaS keeps its 🚀 default');
assert(new Set(PLATFORMS.map(defaultIconFor)).size === PLATFORMS.length, 'defaults are all different, so a board is not a wall of identical icons');

console.log('\n-- cleanup of whatever was typed');
eq(firstGrapheme(''), '', 'empty → empty');
eq(firstGrapheme('   '), '', 'whitespace → empty');
eq(firstGrapheme(' 🎨 '), '🎨', 'surrounding spaces trimmed');
eq(firstGrapheme('🎨🧩👻'), '🎨', 'several emoji → just the first');
eq(firstGrapheme('👨‍💻 dev'), '👨‍💻', 'a joined emoji (man + laptop) is kept whole, not cut in half');
eq(firstGrapheme('🇮🇳 India'), '🇮🇳', 'a flag (two regional indicators) is kept whole');
eq(firstGrapheme('👍🏽'), '👍🏽', 'skin-tone modifiers stay attached');
eq(firstGrapheme('🛠️'), '🛠️', 'emoji with a variation selector stay whole');
eq(firstGrapheme('Meridian'), 'M', 'plain text → first letter (monograms are allowed)');
eq(firstGrapheme('a'.repeat(5000)), 'a', 'very long input is reduced to one character');
eq(normalizeIcon(undefined, '📦'), '📦', 'missing field keeps the fallback');
eq(normalizeIcon(null, '📦'), '📦', 'null keeps the fallback');
eq(normalizeIcon('', '📦'), '📦', 'blank keeps the fallback');
eq(normalizeIcon(42, '📦'), '📦', 'non-string keeps the fallback');
eq(normalizeIcon('🎨', '📦'), '🎨', 'a real choice wins over the fallback');
eq(normalizeIcon('', ''), '', 'blank with no fallback → blank (caller must reject)');

console.log('\n-- curated choices');
const all = ICON_CHOICES.flatMap((g) => g.icons);
assert(all.length >= 40, `${all.length} curated icons`);
assert(new Set(all).size === all.length, 'no duplicate choices');
const multi = all.filter((i) => firstGrapheme(i) !== i);
eq(multi, [], 'every choice is exactly one character (so picking it is never altered by cleanup)');
for (const p of PLATFORMS) assert(all.includes(DEFAULT_ICONS[p]), `${p}'s default (${DEFAULT_ICONS[p]}) is selectable in the picker`);

console.log('\n-- picker rendering');
const html = renderToStaticMarkup(React.createElement(IconPicker, { value: '🎨', onChange: () => {}, defaultIcon: '📦' }));
assert((html.match(/class="icon-opt/g) ?? []).length === all.length, 'renders one button per curated icon');
assert((html.match(/aria-pressed="true"/g) ?? []).length === 1 && /icon-opt selected"[^>]*aria-pressed="true"[^>]*aria-label="Use 🎨"/.test(html), 'exactly the current icon is marked selected');
assert(html.includes('icon-picker-preview" aria-hidden="true">🎨<'), 'preview shows the current icon');
assert(html.includes('placeholder="Type or paste any emoji"'), 'has the free-type box');
assert(/<button type="button" class="mini-btn ghost">Reset<\/button>/.test(html), 'Reset is enabled when the icon differs from the default');
const html2 = renderToStaticMarkup(React.createElement(IconPicker, { value: '📦', onChange: () => {}, defaultIcon: '📦' }));
assert(/<button type="button" class="mini-btn ghost" disabled="">Reset<\/button>/.test(html2), 'Reset is disabled when already on the default');
assert(!html.includes('<form'), 'the picker contains no <form> (it sits inside one)');
assert((html.match(/<button type="button"/g) ?? []).length === all.length + 1, 'every picker button is type="button", so none can submit the form it sits in');

console.log(failures === 0 ? '\nAll icon checks passed.' : `\n${failures} check(s) FAILED.`);
