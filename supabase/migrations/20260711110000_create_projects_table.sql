-- Create projects table
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dataset_metadata jsonb
);

-- Enable RLS and add policies
alter table public.projects enable row level security;

create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Create project_datasets table
create table public.project_datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  csv_data text not null,
  analysis_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS and add policies
alter table public.project_datasets enable row level security;

create policy "Users can view their own project datasets"
  on public.project_datasets for select
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = project_datasets.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can insert their own project datasets"
  on public.project_datasets for insert
  with check (
    exists (
      select 1 from public.projects
      where public.projects.id = project_datasets.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can update their own project datasets"
  on public.project_datasets for update
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = project_datasets.project_id
        and public.projects.user_id = auth.uid()
    )
  );

create policy "Users can delete their own project datasets"
  on public.project_datasets for delete
  using (
    exists (
      select 1 from public.projects
      where public.projects.id = project_datasets.project_id
        and public.projects.user_id = auth.uid()
    )
  );
