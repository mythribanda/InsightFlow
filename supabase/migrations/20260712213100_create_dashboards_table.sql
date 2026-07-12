-- Create dashboards table
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  layout_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS and add policies
alter table public.dashboards enable row level security;

create policy "Users can view their own project dashboards"
  on public.dashboards for select
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = dashboards.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can insert their own project dashboards"
  on public.dashboards for insert
  with check (
    exists (
      select 1 from public.projects
      where public.projects.id = dashboards.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can update their own project dashboards"
  on public.dashboards for update
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = dashboards.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can delete their own project dashboards"
  on public.dashboards for delete
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = dashboards.project_id
        and public.projects.user_id = auth.uid()
    )
  );
