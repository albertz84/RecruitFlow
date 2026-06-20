alter table public.users
alter column credits_remaining set default 15;

update public.users
set credits_remaining = 15
where credits_remaining is null;
