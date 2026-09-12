-- Forgot AI — InsForge schema (Postgres)
-- Run this in your InsForge SQL editor (or via the CLI).

create table if not exists memories (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    capture_type  text not null check (capture_type in ('highlight', 'content')),
    original_content text not null,
    source_url    text not null,
    source_title  text default '',
    source_domain text default '',
    content_hash  text not null,
    ai_title      text,
    ai_summary    text,
    ai_topics     jsonb default '[]'::jsonb,
    ai_keywords   jsonb default '[]'::jsonb,
    ai_entities   jsonb default '[]'::jsonb,
    processing_status text not null default 'pending'
        check (processing_status in ('pending','processing','done','failed')),
    processing_error text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Silent dedupe target
create unique index if not exists memories_dedupe_idx
    on memories (user_id, source_url, content_hash);

create index if not exists memories_user_created_idx
    on memories (user_id, created_at desc);

-- Auto-update updated_at
create or replace function set_updated_at() returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists memories_set_updated_at on memories;
create trigger memories_set_updated_at
    before update on memories
    for each row execute function set_updated_at();
