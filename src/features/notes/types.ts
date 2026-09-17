export interface Note {
  id: string;
  owner_id: string;
  project_id: string | null;
  client_id: string | null;
  title: string;
  vault_path: string;
  tags: string[];
  synced_at: string | null;
  created_at: string;
}
