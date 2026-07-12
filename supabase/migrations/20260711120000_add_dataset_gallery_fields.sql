-- Add columns for Dataset Gallery
alter table public.projects
  add column last_opened_at timestamptz not null default now(),
  add column favorite boolean not null default false,
  add column tags text[] not null default '{}';
