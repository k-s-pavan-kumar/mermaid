import fs from 'fs';
import path from 'path';

// Local-only data layer for development and testing. Methods are async
// even though the underlying file I/O is synchronous — that's deliberate:
// it makes this interface identical in shape to a real network-backed
// store (Supabase), so features/*/queries.ts and actions.ts don't need to
// change at all when DATA_PROVIDER switches. See supabase-store.ts for the
// other implementation of the same shape.
//
// IMPORTANT: this writes to a JSON file on disk, which only works in a
// long-running Node process (e.g. `next dev`). It will NOT work on
// serverless/edge deployments — that's expected, and is exactly why
// DATA_PROVIDER=supabase exists for going live.

const DB_PATH = path.join(process.cwd(), 'data', 'db.local.json');

export type LocalDB = {
  clients: any[];
  projects: any[];
  project_phases: any[];
  quotes: any[];
  invoices: any[];
  bounty_submissions: any[];
  project_metrics: any[];
  milestones: any[];
  notes: any[];
  tasks: any[];
  integrations: any[];
  alert_states: any[];
  meetings: any[];
  settings: any[];
  focus_sessions: any[];
};

export function readDb(): LocalDB {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Local DB not found at ${DB_PATH}. Run "npm run db:seed:local" first.`
    );
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

export function writeDb(db: LocalDB): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export interface TableOps<T> {
  all(): Promise<T[]>;
  find(id: string): Promise<T | undefined>;
  where(pred: (row: T) => boolean): Promise<T[]>;
  insert(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  remove(id: string): Promise<void>;
}

export function table<T extends { id: string }>(name: keyof LocalDB): TableOps<T> {
  return {
    async all(): Promise<T[]> {
      return readDb()[name] as T[];
    },
    async find(id: string): Promise<T | undefined> {
      return (readDb()[name] as T[]).find((r) => r.id === id);
    },
    async where(pred: (row: T) => boolean): Promise<T[]> {
      return (readDb()[name] as T[]).filter(pred);
    },
    async insert(row: T): Promise<T> {
      const db = readDb();
      (db[name] as T[]).push(row);
      writeDb(db);
      return row;
    },
    async update(id: string, patch: Partial<T>): Promise<T | undefined> {
      const db = readDb();
      const rows = db[name] as T[];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return undefined;
      rows[idx] = Object.assign({}, rows[idx], patch) as T;
      writeDb(db);
      return rows[idx];
    },
    async remove(id: string): Promise<void> {
      const db = readDb();
      (db as any)[name] = (db[name] as T[]).filter((r) => r.id !== id);
      writeDb(db);
    },
  };
}
