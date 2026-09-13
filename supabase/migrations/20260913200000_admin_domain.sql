create table public.admin_domains (
  domain text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_domains enable row level security;

insert into public.admin_domains (domain) values ('alnlabs.com');

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if current_setting('mythh.allow_privilege_update', true) = 'true' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;

  return new;
end;
$$;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if exists (select 1 from public.profiles where role = 'ADMIN') then
    return false;
  end if;

  perform set_config('mythh.allow_privilege_update', 'true', true);

  update public.profiles
  set role = 'ADMIN'
  where id = auth.uid();

  return true;
end;
$$;

create or replace function public.apply_admin_allowlist()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  perform set_config('mythh.allow_privilege_update', 'true', true);

  update public.profiles
  set role = 'ADMIN'
  where id = auth.uid()
    and email is not null
    and (
      lower(email) in (select lower(email) from public.admin_allowlist)
      or lower(split_part(email, '@', 2)) in (select lower(domain) from public.admin_domains)
    );

  select * into result
  from public.profiles
  where id = auth.uid();

  return result;
end;
$$;

update public.profiles
set role = 'ADMIN'
where email is not null
  and lower(split_part(email, '@', 2)) = 'alnlabs.com';
