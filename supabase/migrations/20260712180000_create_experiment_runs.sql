-- Create experiment_runs table to persist ML model training results per project.
-- One row is written per model per training run (e.g. 5 rows for 5 models trained together).
-- The primary_score column enables fast ORDER BY without jsonb casting.

create table public.experiment_runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  model_name      text not null,
  hyperparameters jsonb not null default '{}',
  metrics         jsonb not null default '{}',
  task            text not null,          -- "classification" | "regression"
  primary_metric  text not null,
  primary_score   float8 not null,        -- denormalised for efficient ORDER BY / filtering
  created_at      timestamptz not null default now()
);

alter table public.experiment_runs enable row level security;

-- Users can only see runs belonging to their own projects.
create policy "Users can view their own experiment runs"
  on public.experiment_runs for select
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = experiment_runs.project_id
        and public.projects.user_id = auth.uid()
    )
  );

-- Users can insert runs into their own projects.
create policy "Users can insert experiment runs"
  on public.experiment_runs for insert
  with check (
    exists (
      select 1 from public.projects
      where public.projects.id = experiment_runs.project_id
        and public.projects.user_id = auth.uid()
    )
  );

-- Users can delete runs from their own projects (optional, for future clean-up UX).
create policy "Users can delete their own experiment runs"
  on public.experiment_runs for delete
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = experiment_runs.project_id
        and public.projects.user_id = auth.uid()
    )
  );

-- Composite index: efficient lookup of all runs for a project ordered newest-first.
create index idx_experiment_runs_project_id
  on public.experiment_runs(project_id, created_at desc);

-- Partial index: quickly find the best run per model for a project.
create index idx_experiment_runs_model_score
  on public.experiment_runs(project_id, model_name, primary_score desc);
