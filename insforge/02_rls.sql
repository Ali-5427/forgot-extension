-- Forgot AI — Row Level Security
-- Every row is owned by exactly one user; only that user can read/write.

alter table memories enable row level security;

drop policy if exists memories_owner_select on memories;
create policy memories_owner_select on memories
    for select using (auth.uid() = user_id);

drop policy if exists memories_owner_insert on memories;
create policy memories_owner_insert on memories
    for insert with check (auth.uid() = user_id);

drop policy if exists memories_owner_update on memories;
create policy memories_owner_update on memories
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists memories_owner_delete on memories;
create policy memories_owner_delete on memories
    for delete using (auth.uid() = user_id);
