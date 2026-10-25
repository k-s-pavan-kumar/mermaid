/** TPN audit document/step checklist. Stored on the audit as JSON; this is the logic around it. */
export interface CheckItem { id: string; label: string; done: boolean }

export const DEFAULT_AUDIT_CHECKLIST = [
  'Scope and facility details confirmed', 'NDA / engagement letter signed', 'Self-assessment (TPN+) completed',
  'Policies and procedures collected', 'Network and floor diagrams', 'Access-control and CCTV evidence',
  'Site visit scheduled', 'Site visit done', 'Findings report drafted', 'Remediation plan agreed', 'Re-test of fixes', 'Final report delivered',
];

export function defaultChecklist(): CheckItem[] {
  return DEFAULT_AUDIT_CHECKLIST.map((label, i) => ({ id: `d${i + 1}`, label, done: false }));
}

/** Whatever is stored (null, junk, or a real list) -> a clean list; null/empty gets the default template. */
export function readChecklist(raw: unknown): CheckItem[] {
  if (!Array.isArray(raw)) return defaultChecklist();
  const items = raw.filter((x): x is CheckItem => !!x && typeof x === 'object' && typeof (x as CheckItem).id === 'string' && typeof (x as CheckItem).label === 'string')
    .map((x) => ({ id: x.id, label: x.label.slice(0, 120), done: x.done === true }));
  return items.length ? items : defaultChecklist();
}

export const toggleItem = (items: CheckItem[], id: string): CheckItem[] => items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));

export function addItem(items: CheckItem[], label: string, id: string): CheckItem[] {
  const clean = label.trim().replace(/\s+/g, ' ').slice(0, 120);
  return clean && !items.some((i) => i.label.toLowerCase() === clean.toLowerCase()) ? [...items, { id, label: clean, done: false }] : items;
}

export const removeItem = (items: CheckItem[], id: string): CheckItem[] => items.filter((i) => i.id !== id);

export function checklistProgress(items: CheckItem[]): { done: number; total: number; pct: number } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}
