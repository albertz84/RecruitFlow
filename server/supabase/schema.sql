create table if not exists public.users (
  id text primary key,
  gmail_email text not null unique,
  name text not null,
  provider text not null default 'gmail-compose-mvp',
  google_sub text,
  picture_url text,
  email_verified boolean not null default false,
  profile_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index if not exists idx_users_google_sub
  on public.users (google_sub)
  where google_sub is not null and google_sub <> '';

create table if not exists public.schools (
  id text primary key,
  name text not null,
  short_name text,
  division text,
  conference text,
  city text,
  state text,
  staff_page_url text,
  questionnaire_url text,
  program_summary text,
  last_verified date,
  source_url text,
  data_confidence text not null default 'low',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schools_name on public.schools (name);
create index if not exists idx_schools_state on public.schools (state);
create index if not exists idx_schools_division on public.schools (division);

create table if not exists public.coaches (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  x_handle text,
  position_groups jsonb not null default '[]'::jsonb,
  recruiting_states jsonb not null default '[]'::jsonb,
  source_url text,
  last_verified date,
  confidence text not null default 'medium',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name, title)
);

create index if not exists idx_coaches_school_id on public.coaches (school_id);
create index if not exists idx_coaches_active on public.coaches (active);
create index if not exists idx_coaches_email on public.coaches (email);

create table if not exists public.emails (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'generated',
  athlete_name text,
  school_id text,
  school_name text,
  school_division text,
  school_conference text,
  coach_id text,
  coach_name text,
  coach_title text,
  coach_email text,
  coach_x_handle text,
  coach_x_url text,
  email_subject text not null default '',
  email_body text not null default '',
  email_lookup_tip text,
  provider text,
  profile_json jsonb,
  generated_at timestamptz,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emails_user_created on public.emails (user_id, created_at desc);
create index if not exists idx_emails_status on public.emails (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_schools_updated_at on public.schools;
create trigger set_schools_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

drop trigger if exists set_coaches_updated_at on public.coaches;
create trigger set_coaches_updated_at
before update on public.coaches
for each row execute function public.set_updated_at();

drop trigger if exists set_emails_updated_at on public.emails;
create trigger set_emails_updated_at
before update on public.emails
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.schools enable row level security;
alter table public.coaches enable row level security;
alter table public.emails enable row level security;

-- No anon/authenticated policies are created on purpose.
-- The Render backend uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS.
-- Do not put the service-role key in Vercel or any frontend environment.
