create table if not exists public.credit_purchases (
  stripe_session_id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  gmail_email text not null,
  credits integer not null check (credits > 0),
  pack_id text,
  stripe_event_id text,
  stripe_price_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_purchases_user_created
  on public.credit_purchases (user_id, created_at desc);

create or replace function public.grant_credits_for_checkout(
  p_gmail_email text,
  p_credits integer,
  p_stripe_session_id text,
  p_stripe_event_id text default null,
  p_stripe_price_id text default null,
  p_pack_id text default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'credits must be positive';
  end if;

  if p_stripe_session_id is null or btrim(p_stripe_session_id) = '' then
    raise exception 'stripe session id is required';
  end if;

  select u.*
    into v_user
    from public.credit_purchases cp
    join public.users u on u.id = cp.user_id
   where cp.stripe_session_id = p_stripe_session_id;

  if found then
    return v_user;
  end if;

  select *
    into v_user
    from public.users
   where gmail_email = lower(btrim(p_gmail_email))
   for update;

  if not found then
    raise exception 'user not found for checkout';
  end if;

  insert into public.credit_purchases (
    stripe_session_id,
    user_id,
    gmail_email,
    credits,
    pack_id,
    stripe_event_id,
    stripe_price_id
  ) values (
    p_stripe_session_id,
    v_user.id,
    v_user.gmail_email,
    p_credits,
    p_pack_id,
    p_stripe_event_id,
    p_stripe_price_id
  );

  update public.users
     set credits_remaining = credits_remaining + p_credits,
         last_seen_at = now()
   where id = v_user.id
   returning * into v_user;

  return v_user;
end;
$$;

alter table public.credit_purchases enable row level security;
