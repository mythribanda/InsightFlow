-- Add missing INSERT policy for profiles table.
-- The handle_new_user() trigger (SECURITY DEFINER) creates the row on signup,
-- but the client-side .upsert() in complete-profile pages needs this policy
-- as a safety net for the INSERT branch (timing edge cases, OAuth paths, etc.)
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
