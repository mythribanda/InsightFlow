-- Create saved_queries table
create table public.saved_queries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  query_text text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS and add policies
alter table public.saved_queries enable row level security;

create policy "Users can view saved queries of their own projects"
  on public.saved_queries for select
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = saved_queries.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can insert saved queries of their own projects"
  on public.saved_queries for insert
  with check (
    exists (
      select 1 from public.projects
      where public.projects.id = saved_queries.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can delete saved queries of their own projects"
  on public.saved_queries for delete
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = saved_queries.project_id
        and public.projects.user_id = auth.uid()
    )
  );
