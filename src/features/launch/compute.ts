/** Product launch readiness — pure. */
export interface PieceInput {
  id: string; name: string; role: string | null; status: string;
  milestonesDone: number; milestonesTotal: number; tasksDone: number; tasksOpen: number;
}
export interface PieceReadiness extends PieceInput { readiness: number; blocked: boolean; reason: string | null }
export type LaunchVerdict = 'no-date' | 'launched' | 'late' | 'at-risk' | 'on-track';
export interface LaunchPlan {
  launchDate: string | null; daysToLaunch: number | null; overall: number; verdict: LaunchVerdict;
  pieces: PieceReadiness[]; blockers: PieceReadiness[];
}

const STATUS_BASE: Record<string, number> = { done: 100, review: 80, ontrack: 45, risk: 20, idea: 10, dropped: 0 };

/** 0–100. Done = 100. Otherwise half milestones, half tasks when they exist; else a guess from the status. */
export function pieceReadiness(p: PieceInput): number {
  if (p.status === 'done') return 100;
  const parts: number[] = [];
  if (p.milestonesTotal > 0) parts.push(p.milestonesDone / p.milestonesTotal);
  const taskTotal = p.tasksDone + p.tasksOpen;
  if (taskTotal > 0) parts.push(p.tasksDone / taskTotal);
  if (parts.length === 0) return STATUS_BASE[p.status] ?? 10;
  const measured = (parts.reduce((a, b) => a + b, 0) / parts.length) * 95; // never 100 until the status says done
  return Math.round(Math.max(measured, p.status === 'review' ? 80 : 0));
}

export function launchPlan(launchDate: string | null, today: string, pieces: PieceInput[]): LaunchPlan {
  const live = pieces.filter((p) => p.status !== 'dropped');
  const days = launchDate ? Math.round((Date.parse(launchDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null;
  const rated = live.map((p): PieceReadiness => {
    const readiness = pieceReadiness(p);
    let reason: string | null = null;
    if (p.status !== 'done') {
      if (p.status === 'risk') reason = 'Marked at risk';
      else if (days !== null && days < 0) reason = 'Launch date has passed and this is not done';
      else if (days !== null && days <= 14 && readiness < 70) reason = `${readiness}% ready with ${days} day${days === 1 ? '' : 's'} left`;
    }
    return { ...p, readiness, blocked: reason !== null, reason };
  });
  const overall = rated.length ? Math.round(rated.reduce((a, p) => a + p.readiness, 0) / rated.length) : 0;
  const blockers = rated.filter((p) => p.blocked);
  let verdict: LaunchVerdict = 'on-track';
  if (days === null) verdict = 'no-date';
  else if (rated.length > 0 && rated.every((p) => p.status === 'done')) verdict = 'launched';
  else if (days < 0) verdict = 'late';
  else if (blockers.length > 0) verdict = 'at-risk';
  return { launchDate, daysToLaunch: days, overall, verdict, pieces: rated, blockers };
}
