-- Multiple Google accounts (emails) per ArabicBuzz user for Calendar alignment.
-- Migrates 013 single-row PK (user_id) → id PK + unique (user_id, email).

alter table public.google_oauth_tokens
  add column if not exists id uuid;

update public.google_oauth_tokens
set id = gen_random_uuid()
where id is null;

alter table public.google_oauth_tokens
  alter column id set default gen_random_uuid(),
  alter column id set not null;

-- Normalize empty emails so unique constraint works
update public.google_oauth_tokens
set email = lower(trim(email))
where email is not null;

update public.google_oauth_tokens
set email = 'unknown+' || user_id || '@local.invalid'
where email is null or trim(email) = '';

alter table public.google_oauth_tokens
  alter column email set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'google_oauth_tokens_pkey'
      and conrelid = 'public.google_oauth_tokens'::regclass
  ) then
    alter table public.google_oauth_tokens drop constraint google_oauth_tokens_pkey;
  end if;
end $$;

alter table public.google_oauth_tokens
  add constraint google_oauth_tokens_pkey primary key (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'google_oauth_tokens_user_email_key'
      and conrelid = 'public.google_oauth_tokens'::regclass
  ) then
    alter table public.google_oauth_tokens
      add constraint google_oauth_tokens_user_email_key unique (user_id, email);
  end if;
end $$;

create index if not exists google_oauth_tokens_user_id_idx
  on public.google_oauth_tokens (user_id);

create index if not exists google_oauth_tokens_user_updated_idx
  on public.google_oauth_tokens (user_id, updated_at desc);
