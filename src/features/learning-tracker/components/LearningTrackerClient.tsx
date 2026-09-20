'use client';

import { useState } from 'react';
import type { Course } from '../types';
import { courseStatus, courseProgressPct, TOPIC_TAG_CHOICES } from '../types';
import { addCourse, updateLessonProgress, deleteCourse } from '../actions';

function pretty(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'slate' },
  in_progress: { label: 'In progress', cls: 'amber' },
  completed: { label: 'Completed', cls: 'green' },
};

export function LearningTrackerClient({
  courses, needOptions,
}: {
  courses: Course[];
  needOptions: { id: string; name: string }[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const tags = [...new Set(courses.flatMap((c) => c.topic_tags))].sort();
  const filtered = filter ? courses.filter((c) => c.topic_tags.includes(filter)) : courses;

  return (
    <>
      {tags.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 18 }}>
          <button type="button" className={`scope-chip${filter === null ? ' active' : ''}`} onClick={() => setFilter(null)}>All</button>
          {tags.map((t) => (
            <button key={t} type="button" className={`scope-chip${filter === t ? ' active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
      )}

      <div className="lt-grid">
        {filtered.map((c) => {
          const status = courseStatus(c);
          const pct = courseProgressPct(c);
          const label = STATUS_LABEL[status] ?? { label: status, cls: 'slate' };
          return (
            <div key={c.id} className="card lt-card">
              <div className="lt-top">
                <div>
                  <div className="lt-title">{c.title}</div>
                  <div className="lt-provider">{c.provider}</div>
                </div>
                <span className={`rv-chip ${label.cls}`}>{label.label}</span>
              </div>
              {c.topic_tags.length > 0 && (
                <div className="lt-tags">{c.topic_tags.map((t) => <span key={t} className="lt-tag">{t}</span>)}</div>
              )}
              <div className="lt-progress-track"><div className={`lt-progress-fill ${status}`} style={{ width: `${pct}%` }} /></div>
              <div className="lt-progress-row">
                <span>{c.completed_lessons} of {c.total_lessons} lessons</span>
                <span>{pct}%</span>
              </div>
              {status !== 'completed' ? (
                <div className="lt-lesson-controls">
                  <button type="button" className="mini-btn ghost" disabled={c.completed_lessons <= 0}
                    onClick={() => void updateLessonProgress(c.id, c.completed_lessons - 1)}>− lesson</button>
                  <button type="button" className="mini-btn"
                    onClick={() => void updateLessonProgress(c.id, c.completed_lessons + 1)}>+ lesson done</button>
                </div>
              ) : (
                <div className="text-muted text-sm" style={{ marginTop: 8 }}>Completed {pretty(c.completed_at)}</div>
              )}
              <button type="button" className="mini-btn ghost" style={{ marginTop: 8 }} onClick={() => void deleteCourse(c.id)}>Remove</button>
            </div>
          );
        })}

        <div className="lt-add-card" onClick={() => setAddOpen(true)}>+ Add a course</div>
      </div>

      {addOpen && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div className="modal">
            <div className="modal-head"><h2>Add a course</h2><button type="button" className="modal-close" onClick={() => setAddOpen(false)}>✕</button></div>
            <form action={async (fd) => { await addCourse(fd); setAddOpen(false); }}>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="title">Course / certification</label>
                <input id="title" name="title" required placeholder="e.g. Advanced TypeScript" style={{ width: '100%' }} />
              </div>
              <div className="grid-2-eq" style={{ marginBottom: 12 }}>
                <div>
                  <label className="field-label" htmlFor="provider">Provider</label>
                  <input id="provider" name="provider" required placeholder="e.g. Frontend Masters" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="total_lessons">Total lessons</label>
                  <input id="total_lessons" name="total_lessons" type="number" min={1} step="1" required placeholder="20" style={{ width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="topic_tag">Topic</label>
                <select id="topic_tag" name="topic_tag" style={{ width: '100%' }}>
                  <option value="">No topic</option>
                  {TOPIC_TAG_CHOICES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {needOptions.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <label className="field-label" htmlFor="link_need_id">Link to a Reward Vault need (optional)</label>
                  <select id="link_need_id" name="link_need_id" style={{ width: '100%' }}>
                    <option value="">Don&apos;t link</option>
                    {needOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
                <button type="submit" className="btn">Add course</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
