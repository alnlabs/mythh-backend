alter table public.votes
  add column if not exists anonymous_id uuid,
  add column if not exists is_correct boolean;

alter table public.votes
  disable trigger votes_enforce_owner;

update public.votes
set is_correct = exists (
  select 1
  from public.myths
  where myths.id = votes.myth_id
    and (
      (votes.value = 'TRUE' and myths.verdict = 'TRUE')
      or (votes.value = 'FALSE' and myths.verdict = 'FALSE')
    )
)
where is_correct is null;

alter table public.votes
  alter column is_correct set default false;

alter table public.votes
  alter column user_id drop not null;

alter table public.votes
  drop constraint if exists votes_myth_id_user_id_key;

alter table public.votes
  drop constraint if exists votes_identity_check;

alter table public.votes
  add constraint votes_identity_check check (
    (user_id is not null and anonymous_id is null)
    or (user_id is null and anonymous_id is not null)
  );

drop index if exists public.votes_myth_user_unique;
drop index if exists public.votes_myth_anon_unique;

create unique index votes_myth_user_unique
  on public.votes (myth_id, user_id)
  where user_id is not null;

create unique index votes_myth_anon_unique
  on public.votes (myth_id, anonymous_id)
  where anonymous_id is not null;

create or replace function public.enforce_vote_owner()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    if tg_op = 'INSERT' then
      new.anonymous_id := null;
    end if;
  else
    new.user_id := null;
    if new.anonymous_id is null then
      raise exception 'anonymous_id required'
        using errcode = '22023';
    end if;
  end if;

  select
    (new.value = 'TRUE' and myths.verdict = 'TRUE')
    or (new.value = 'FALSE' and myths.verdict = 'FALSE')
  into new.is_correct
  from public.myths
  where myths.id = new.myth_id;

  new.is_correct := coalesce(new.is_correct, false);
  return new;
end;
$$;

alter table public.votes
  enable trigger votes_enforce_owner;

drop policy if exists votes_insert_own on public.votes;
drop policy if exists votes_update_own on public.votes;
drop policy if exists votes_insert_cast on public.votes;

create policy votes_insert_cast on public.votes
  for insert
  to anon, authenticated
  with check (
    (
      auth.uid() is not null
      and user_id = auth.uid()
      and anonymous_id is null
    )
    or (
      auth.uid() is null
      and user_id is null
      and anonymous_id is not null
    )
  );

create policy votes_update_own on public.votes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_id is null);

create or replace function public.cast_vote(
  p_myth_id uuid,
  p_value public.vote_value,
  p_anonymous_id uuid default null
)
returns table (
  vote_id uuid,
  vote_value public.vote_value,
  is_correct boolean,
  already_answered boolean,
  correct_answer text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_verdict public.myth_verdict;
  v_correct boolean;
  v_id uuid;
  v_value public.vote_value;
  v_is_correct boolean;
  v_inserted int;
begin
  select myths.verdict
  into v_verdict
  from public.myths
  where myths.id = p_myth_id
    and myths.status = 'APPROVED';

  if not found then
    raise exception 'Myth not found' using errcode = 'P0002';
  end if;

  v_correct :=
    (p_value = 'TRUE' and v_verdict = 'TRUE')
    or (p_value = 'FALSE' and v_verdict = 'FALSE');

  if uid is not null then
    insert into public.votes (myth_id, user_id, anonymous_id, value, is_correct)
    values (p_myth_id, uid, null, p_value, v_correct)
    on conflict (myth_id, user_id) where user_id is not null
    do update
      set value = excluded.value,
          is_correct = excluded.is_correct,
          updated_at = now()
    returning votes.id, votes.value, votes.is_correct
    into v_id, v_value, v_is_correct;

    return query select
      v_id,
      v_value,
      v_is_correct,
      false,
      case
        when v_verdict in ('TRUE', 'FALSE') then v_verdict::text
        else null
      end;
    return;
  end if;

  if p_anonymous_id is null then
    raise exception 'anonymous_id required' using errcode = '22023';
  end if;

  insert into public.votes (myth_id, user_id, anonymous_id, value, is_correct)
  values (p_myth_id, null, p_anonymous_id, p_value, v_correct)
  on conflict (myth_id, anonymous_id) where anonymous_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  select votes.id, votes.value, votes.is_correct
  into v_id, v_value, v_is_correct
  from public.votes
  where votes.myth_id = p_myth_id
    and votes.anonymous_id = p_anonymous_id;

  return query select
    v_id,
    v_value,
    v_is_correct,
    v_inserted = 0,
    case
      when v_verdict in ('TRUE', 'FALSE') then v_verdict::text
      else null
    end;
end;
$$;

create or replace function public.claim_anonymous_votes(p_anonymous_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  claimed integer := 0;
begin
  if uid is null or p_anonymous_id is null then
    return 0;
  end if;

  delete from public.votes as anon_vote
  using public.votes as user_vote
  where anon_vote.anonymous_id = p_anonymous_id
    and anon_vote.user_id is null
    and user_vote.user_id = uid
    and user_vote.myth_id = anon_vote.myth_id;

  update public.votes
  set user_id = uid,
      anonymous_id = null,
      updated_at = now()
  where anonymous_id = p_anonymous_id
    and user_id is null;

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.cast_vote(uuid, public.vote_value, uuid) from public;
revoke all on function public.claim_anonymous_votes(uuid) from public;
grant execute on function public.cast_vote(uuid, public.vote_value, uuid) to anon, authenticated;
grant execute on function public.claim_anonymous_votes(uuid) to authenticated;
