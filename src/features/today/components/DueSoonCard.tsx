'use client';

import type { Task } from '../types';
import { DueBadge } from './DueBadge';
import { ActionButton } from '@/components/ActionButton';

/** Deadlines in the next two days (or already late), most urgent first. */
export function DueSoonCard({
  tasks, today, projectName, markDone,
}: {
  tasks: Task[];
  today: string;
  projectName: (id: string | null) => string | null;
  markDone: (id: string) => Promise<void>;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 14, padding: '12px 18px' }}>
      <strong style={{ fontSize: 13 }}>Deadlines closing in <span className="text-muted" style={{ fontWeight: 400 }}>· {tasks.length}</span></strong>
      {tasks.slice(0, 6).map((t) => (
        <div key={t.id} className="list-row" style={{ padding: '7px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <DueBadge due={t.due_date!} today={today} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {projectName(t.project_id) && <span className="text-muted" style={{ fontSize: 11 }}>{projectName(t.project_id)}</span>}
          </span>
          <ActionButton action={() => markDone(t.id)} className="btn-ghost" pendingLabel="…" style={{ fontSize: 11.5, padding: '4px 9px' }}>Done</ActionButton>
        </div>
      ))}
      {tasks.length > 6 && <div className="text-muted" style={{ fontSize: 11.5, paddingTop: 6 }}>+{tasks.length - 6} more</div>}
    </div>
  );
}
