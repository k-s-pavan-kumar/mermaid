// npm run verify:tags
//
// Custom "type of work" tags on clients: the normalisation rules shared by the
// server actions, the assistant tool and the picker, plus the picker's
// server-rendered output. (The save path through the real server actions and
// the Supabase constraint are exercised separately; see README.)

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WORK_TYPES, clientWorkTypes } from '../src/features/clients/types';
import {
  MAX_TAGS_PER_CLIENT, MAX_TAG_LENGTH, cleanTagText, collectCustomTags, isBuiltInWorkType,
  normalizeWorkTypes, workTypeColor, workTypeLabel,
} from '../src/features/clients/work-types';
import { WorkTypePicker } from '../src/features/clients/components/WorkTypePicker';

// tsx uses the classic JSX transform (tsconfig says `jsx: preserve` for Next); only this script needs the shim.
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

console.log('-- built-ins');
eq(WORK_TYPES.length, 9, 'nine built-in kinds');
assert(isBuiltInWorkType('web') && isBuiltInWorkType('marketing') && !isBuiltInWorkType('SEO'), 'built-in detection');
assert(!isBuiltInWorkType('constructor') && !isBuiltInWorkType('__proto__') && !isBuiltInWorkType('toString'), 'object-prototype names are not mistaken for built-ins');
eq(workTypeLabel('web'), 'Web development', 'built-in key → its label');
eq(workTypeLabel('SEO'), 'SEO', 'custom tag → its own text');
eq(workTypeColor('web'), 'var(--cyan)', 'built-ins keep their colour');

console.log('\n-- normalising what was submitted');
eq(normalizeWorkTypes(['web', 'design']), ['web', 'design'], 'built-in keys pass through');
eq(normalizeWorkTypes(['SEO', 'Photography']), ['SEO', 'Photography'], 'custom tags are kept');
eq(normalizeWorkTypes(['Web development']), ['web'], 'typing a built-in\'s full name selects the built-in, not a custom twin');
eq(normalizeWorkTypes(['WEB', 'digital marketing', 'Teaching / training']), ['web', 'marketing', 'teaching'], 'built-in keys and names match in any capitalisation');
eq(normalizeWorkTypes(['SEO', 'seo', ' Seo ']), ['SEO'], 'case-insensitive duplicates collapse to the first');
eq(normalizeWorkTypes(['web', 'Web development', 'WEB']), ['web'], 'a built-in typed three ways is one tag');
eq(normalizeWorkTypes(['seo'], ['SEO']), ['SEO'], 'reuses the spelling of a tag you already use ("seo" → "SEO")');
eq(normalizeWorkTypes(['SEO'], ['seo']), ['seo'], '...whichever spelling came first in your library');
eq(normalizeWorkTypes(['  Video    editing  ']), ['Video editing'], 'whitespace is trimmed and collapsed');
eq(normalizeWorkTypes(['x'.repeat(100)])[0]?.length, MAX_TAG_LENGTH, `tags are capped at ${MAX_TAG_LENGTH} characters`);
eq(cleanTagText('<script>alert(1)</script>'), 'script alert(1) /script', 'angle brackets are stripped');
assert(!/[<>]/.test(normalizeWorkTypes(['<img src=x onerror=alert(1)>'])[0] ?? ''), 'no angle brackets survive');
eq(normalizeWorkTypes(['SE\u0000O\n']), ['SE O'], 'control characters become spaces');
eq(normalizeWorkTypes([null, undefined, 5, {}, [], true, '', '   ']), [], 'non-strings and blanks are dropped');
eq(normalizeWorkTypes([]), [], 'empty in, empty out');
eq(normalizeWorkTypes(['Fotografía', '写真', '🎥 Video']), ['Fotografía', '写真', '🎥 Video'], 'non-English text and emoji are fine');
eq(normalizeWorkTypes(['constructor', '__proto__', 'toString']), ['constructor', '__proto__', 'toString'], 'prototype-ish names are ordinary custom tags');
const many = Array.from({ length: 30 }, (_, i) => `Tag ${i}`);
eq(normalizeWorkTypes(many).length, MAX_TAGS_PER_CLIENT, `at most ${MAX_TAGS_PER_CLIENT} tags per client`);
eq(normalizeWorkTypes(many)[0], 'Tag 0', '...keeping the first ones');

console.log('\n-- colours');
eq(workTypeColor('SEO'), workTypeColor('seo'), 'a custom tag has the same colour in any capitalisation');
eq(workTypeColor('SEO'), workTypeColor('SEO'), 'and the same colour every time');
const cols = new Set(['SEO', 'Photography', 'Video', 'Legal', 'Audit', 'Podcast', 'Research', 'Translation', 'Coaching', 'Hosting'].map(workTypeColor));
assert(cols.size >= 4, `custom tags spread across the palette (${cols.size} distinct colours in 10 tags)`);
assert([...cols].every((c) => /^var\(--[a-z]+\)$/.test(c)), 'colours are existing theme variables');

console.log('\n-- the library of tags you already use');
const lib = collectCustomTags([
  { work_types: ['web', 'SEO', 'photography'] },
  { work_types: ['seo', 'Audit', 'design'] },
  { work_types: undefined },
  { work_types: null },
  { work_types: ['  ', 'Zine'] },
]);
eq(lib, ['Audit', 'photography', 'SEO', 'Zine'], 'distinct custom tags, case-insensitive, built-ins excluded, sorted A→Z');
eq(collectCustomTags([]), [], 'no clients → empty library');
eq(clientWorkTypes({ work_types: ['web', 'SEO', '', '  '] }), ['web', 'SEO'], 'clientWorkTypes keeps custom tags and drops blanks');

console.log('\n-- picker (server-rendered)');
const html = renderToStaticMarkup(React.createElement(WorkTypePicker, { initial: ['web', 'SEO'], customTags: ['Photography', 'SEO'] }));
const chipCount = (html.match(/class="type-chip/g) ?? []).length;
eq(chipCount, 9 + 2 + 1, '9 built-ins + 2 custom (SEO not duplicated) + the "Add tag" button');
assert(html.includes('+ Add tag'), 'has an "+ Add tag" button');
eq((html.match(/aria-pressed="true"/g) ?? []).length, 2, 'only the selected tags are marked pressed');
assert(/type-chip on"[^>]*aria-pressed="true"[^>]*>.*?SEO/.test(html), 'a selected custom tag renders as selected');
eq((html.match(/<input type="hidden" name="work_types"/g) ?? []).length, 2, 'one hidden form field per selected tag');
assert(html.includes('name="work_types" value="SEO"') && html.includes('name="work_types" value="web"'), 'hidden fields carry the keys / tag text');
assert(!html.includes('<form'), 'the picker has no <form> of its own (it sits inside one)');
const bare = renderToStaticMarkup(React.createElement(WorkTypePicker, {}));
eq((bare.match(/class="type-chip/g) ?? []).length, 10, 'with no custom tags: 9 built-ins + Add tag (same as before, plus the new button)');
assert(!bare.includes('name="work_types"'), 'nothing selected → nothing posted');
assert((html.match(/<button type="button"/g) ?? []).length === chipCount, 'every picker button is type="button" (none can submit the client form)');

console.log(failures === 0 ? '\nAll work-tag checks passed.' : `\n${failures} check(s) FAILED.`);
