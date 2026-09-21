export interface Note {
  id: string;
  owner_id: string;
  project_id: string | null;
  client_id: string | null;
  title: string;
  vault_path: string;
  tags: string[];
  /** Note body, stored in the DB so it survives hosts with no writable disk. */
  content?: string;
  synced_at: string | null;
  created_at: string;
}
