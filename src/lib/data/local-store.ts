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
  targets_history: any[];
  finance_entries: any[];
  finance_categories: any[];
  finance_category_rules: any[];
  finance_obligations: any[];
  bounty_cases: any[];
  needs: any[];
  courses: any[];
  tracked_packages: any[];
  metric_snapshots: any[];
  project_status_log: any[];
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
  findBy(column: keyof T & string, value: unknown): Promise<T | undefined>;
  where(pred: (row: T) => boolean): Promise<T[]>;
  insert(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  remove(id: string): Promise<void>;
}

export function table<T extends { id: string }>(name: keyof LocalDB): TableOps<T> {
  // Any table added after the app was first deployed — targets_history is
  // the newest — can be absent from an older data/db.local.json or from a
  // hand-built fixture in a test script that predates it. Falling back to
  // an empty array here (rather than the raw `undefined` a real user file
  // would have) means "this table has no rows yet", which is the correct
  // reading, instead of every read of it throwing.
  const rowsOf = (db: LocalDB): T[] => (db[name] as T[] | undefined) ?? [];

  return {
    async all(): Promise<T[]> {
      return rowsOf(readDb());
    },
    async find(id: string): Promise<T | undefined> {
      return rowsOf(readDb()).find((r) => r.id === id);
    },
    async findBy(column: keyof T & string, value: unknown): Promise<T | undefined> {
      return rowsOf(readDb()).find((r) => r[column] === value);
    },
    async where(pred: (row: T) => boolean): Promise<T[]> {
      return rowsOf(readDb()).filter(pred);
    },
    async insert(row: T): Promise<T> {
      const db = readDb();
      if (!db[name]) (db as any)[name] = [];
      (db[name] as T[]).push(row);
      writeDb(db);
      return row;
    },
    async update(id: string, patch: Partial<T>): Promise<T | undefined> {
      const db = readDb();
      const rows = rowsOf(db);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return undefined;
      rows[idx] = Object.assign({}, rows[idx], patch) as T;
      (db as any)[name] = rows;
      writeDb(db);
      return rows[idx];
    },
    async remove(id: string): Promise<void> {
      const db = readDb();
      (db as any)[name] = rowsOf(db).filter((r) => r.id !== id);
      writeDb(db);
    },
  };
}
