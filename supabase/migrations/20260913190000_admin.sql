create table public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_allowlist enable row level security;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

create or replace function public.enforce_report_owner()
returns trigger
language plpgsql
as $$
begin
  new.reporter_id := auth.uid();
  return new;
end;
$$;

create trigger reports_enforce_owner
  before insert on public.reports
  for each row execute function public.enforce_report_owner();

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
  update public.profiles
  set role = 'ADMIN'
  where id = auth.uid()
    and email is not null
    and lower(email) in (select lower(email) from public.admin_allowlist);

  select * into result
  from public.profiles
  where id = auth.uid();

  return result;
end;
$$;

grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.apply_admin_allowlist() to authenticated;

create policy myths_delete_admin on public.myths
  for delete using (public.is_admin());

create policy comments_update_admin on public.comments
  for update using (public.is_admin()) with check (public.is_admin());

create policy reports_update_admin on public.reports
  for update using (public.is_admin()) with check (public.is_admin());

create policy profiles_update_admin on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
