-- Google Calendar / OAuth tokens (per Supabase Auth user)
create table if not exists public.google_oauth_tokens (
  user_id text primary key,
  email text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now()
);

create index if not exists google_oauth_tokens_email_idx
  on public.google_oauth_tokens (email);

alter table public.google_oauth_tokens enable row level security;
