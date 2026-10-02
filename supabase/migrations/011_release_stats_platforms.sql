-- Release Stats: more platforms (VS Code, Figma, Snapchat, SaaS), a linked
-- GitHub repo for stars, manual SaaS numbers, and a visible sync error.
alter table tracked_packages drop constraint if exists tracked_packages_platform_check;
alter table tracked_packages add constraint tracked_packages_platform_check
  check (platform in ('npm', 'pypi', 'github', 'vscode_marketplace', 'figma_plugin', 'snapchat_lens', 'chrome_web_store', 'saas'));
alter table tracked_packages add column if not exists github_repo text;

alter table metric_snapshots add column if not exists users       integer;
alter table metric_snapshots add column if not exists mrr         numeric;
alter table metric_snapshots add column if not exists source      text not null default 'auto' check (source in ('auto', 'manual'));
alter table metric_snapshots add column if not exists fetch_error text;
