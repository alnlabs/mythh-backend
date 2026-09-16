create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.keep_alive (
  id smallint primary key check (id = 1),
  touched_at timestamptz not null default now()
);

alter table public.keep_alive enable row level security;

drop policy if exists keep_alive_select_all on public.keep_alive;
create policy keep_alive_select_all on public.keep_alive
  for select using (true);

create or replace function public.keep_alive_ping()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_get(
    url := 'https://mythh-backend.vercel.app/api/v1/myths?limit=1',
    headers := '{"accept":"application/json"}'::jsonb,
    timeout_milliseconds := 8000
  );
  return new;
end;
$$;

drop trigger if exists keep_alive_http_ping on public.keep_alive;
create trigger keep_alive_http_ping
  after insert or update on public.keep_alive
  for each row execute function public.keep_alive_ping();

insert into public.keep_alive (id, touched_at)
values (1, now())
on conflict (id) do update set touched_at = now();

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'keep-supabase-alive'
  ) then
    perform cron.unschedule('keep-supabase-alive');
  end if;
end;
$$;

select cron.schedule(
  'keep-supabase-alive',
  '0 */6 * * *',
  $$update public.keep_alive set touched_at = now() where id = 1$$
);
