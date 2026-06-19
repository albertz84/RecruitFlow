alter table public.users
add column if not exists credits_remaining integer not null default 25;

update public.users
set credits_remaining = 25
where credits_remaining is null;
