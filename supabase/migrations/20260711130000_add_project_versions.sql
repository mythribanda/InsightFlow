-- Create project_versions table for snapshot-based version history
create table public.project_versions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  version_number  integer not null,
  dataset_snapshot text not null,
  analysis_result  jsonb,
  change_note     text,
  created_at      timestamptz not null default now(),
  unique(project_id, version_number)
);

-- Enable RLS
alter table public.project_versions enable row level security;

-- RLS: read access scoped to the owning project's user
create policy "Users can view own project versions"
  on public.project_versions for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
        and projects.user_id = auth.uid()
    )
  );

-- RLS: insert access scoped to the owning project's user
create policy "Users can insert own project versions"
  on public.project_versions for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
        and projects.user_id = auth.uid()
    )
  );

-- RLS: delete access scoped to the owning project's user (for cleanup)
create policy "Users can delete own project versions"
  on public.project_versions for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
        and projects.user_id = auth.uid()
    )
  );

-- Index for fast per-project version lookups
create index idx_project_versions_project_id
  on public.project_versions(project_id, version_number desc);
