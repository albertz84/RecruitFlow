alter table public.users
  alter column credits_remaining type numeric(10,2)
  using credits_remaining::numeric;

alter table public.coaches
  add column if not exists x_user_id text;

create table if not exists public.user_x_accounts (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  x_user_id text not null,
  username text not null,
  display_name text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (x_user_id)
);

create table if not exists public.dm_history (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  email_history_id text references public.emails(id) on delete set null,
  status text not null default 'draft',
  mode text not null default 'coach_dm',
  athlete_name text,
  school_id text,
  school_name text,
  school_division text,
  school_conference text,
  coach_id text,
  coach_name text,
  coach_title text,
  coach_x_handle text,
  coach_x_url text,
  coach_x_user_id text,
  dm_body text not null default '',
  provider text,
  profile_json jsonb,
  generated_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  x_dm_event_id text,
  x_dm_conversation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_x_accounts_user_id
  on public.user_x_accounts (user_id);

create index if not exists idx_dm_history_user_created
  on public.dm_history (user_id, created_at desc);

create index if not exists idx_dm_history_status
  on public.dm_history (status);

create index if not exists idx_dm_history_coach_user
  on public.dm_history (user_id, coach_id, coach_x_handle);

drop trigger if exists set_user_x_accounts_updated_at on public.user_x_accounts;
create trigger set_user_x_accounts_updated_at
before update on public.user_x_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_dm_history_updated_at on public.dm_history;
create trigger set_dm_history_updated_at
before update on public.dm_history
for each row execute function public.set_updated_at();

alter table public.user_x_accounts enable row level security;
alter table public.dm_history enable row level security;
