create extension if not exists pgcrypto;

create type public.user_role as enum ('USER', 'ADMIN');
create type public.user_status as enum ('ACTIVE', 'SUSPENDED');
create type public.myth_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.myth_verdict as enum ('TRUE', 'FALSE', 'PARTIALLY_TRUE', 'UNCERTAIN');
create type public.vote_value as enum ('TRUE', 'FALSE');
create type public.comment_status as enum ('VISIBLE', 'HIDDEN');
create type public.report_target as enum ('MYTH', 'COMMENT');
create type public.report_status as enum ('OPEN', 'REVIEWED', 'DISMISSED');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'USER',
  status public.user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.myths (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  verdict public.myth_verdict not null default 'UNCERTAIN',
  explanation text not null,
  category_id uuid not null references public.categories (id),
  creator_id uuid references public.profiles (id) on delete set null,
  status public.myth_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  myth_id uuid not null references public.myths (id) on delete cascade,
  title text,
  url text not null,
  created_at timestamptz not null default now()
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  myth_id uuid not null references public.myths (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value public.vote_value not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (myth_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  myth_id uuid not null references public.myths (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  status public.comment_status not null default 'VISIBLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target public.report_target not null,
  myth_id uuid references public.myths (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  status public.report_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target = 'MYTH' and myth_id is not null and comment_id is null)
    or (target = 'COMMENT' and comment_id is not null)
  )
);

create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  link_url text,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index myths_status_created_at_idx on public.myths (status, created_at desc);
create index myths_category_id_idx on public.myths (category_id);
create index sources_myth_id_idx on public.sources (myth_id);
create index votes_myth_id_idx on public.votes (myth_id);
create index comments_myth_id_idx on public.comments (myth_id, created_at desc);
create index reports_status_idx on public.reports (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger myths_set_updated_at
  before update on public.myths
  for each row execute function public.set_updated_at();

create trigger votes_set_updated_at
  before update on public.votes
  for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create trigger advertisements_set_updated_at
  before update on public.advertisements
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
      and status = 'ACTIVE'
  );
$$;

create or replace function public.enforce_myth_submission()
returns trigger
language plpgsql
as $$
begin
  -- SQL migrations and service-role seeds have no JWT.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    new.status := 'PENDING';
    new.creator_id := auth.uid();
  elsif new.creator_id is null then
    new.creator_id := auth.uid();
  end if;

  return new;
end;
$$;

create trigger myths_enforce_submission
  before insert on public.myths
  for each row execute function public.enforce_myth_submission();

create or replace function public.enforce_vote_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

create trigger votes_enforce_owner
  before insert or update on public.votes
  for each row execute function public.enforce_vote_owner();

create or replace function public.enforce_comment_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  new.status := 'VISIBLE';
  return new;
end;
$$;

create trigger comments_enforce_owner
  before insert on public.comments
  for each row execute function public.enforce_comment_owner();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.myths enable row level security;
alter table public.sources enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.advertisements enable row level security;

create policy profiles_select_all on public.profiles
  for select using (true);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy categories_select_all on public.categories
  for select using (true);

create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy myths_select_public on public.myths
  for select using (
    status = 'APPROVED'
    or creator_id = auth.uid()
    or public.is_admin()
  );

create policy myths_insert_authenticated on public.myths
  for insert to authenticated with check (auth.uid() is not null);

create policy myths_update_admin on public.myths
  for update using (public.is_admin()) with check (public.is_admin());

create policy sources_select_public on public.sources
  for select using (
    exists (
      select 1 from public.myths
      where myths.id = sources.myth_id
        and (
          myths.status = 'APPROVED'
          or myths.creator_id = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy sources_insert_with_myth on public.sources
  for insert to authenticated with check (
    exists (
      select 1 from public.myths
      where myths.id = sources.myth_id
        and (myths.creator_id = auth.uid() or public.is_admin())
    )
  );

create policy votes_select_all on public.votes
  for select using (true);

create policy votes_insert_own on public.votes
  for insert to authenticated with check (auth.uid() is not null);

create policy votes_update_own on public.votes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy comments_select_visible on public.comments
  for select using (
    status = 'VISIBLE'
    or user_id = auth.uid()
    or public.is_admin()
  );

create policy comments_insert_authenticated on public.comments
  for insert to authenticated with check (auth.uid() is not null);

create policy comments_delete_admin on public.comments
  for delete using (public.is_admin());

create policy reports_select_own on public.reports
  for select using (reporter_id = auth.uid() or public.is_admin());

create policy reports_insert_own on public.reports
  for insert to authenticated with check (auth.uid() is not null);

create policy advertisements_select_active on public.advertisements
  for select using (
    public.is_admin()
    or (
      is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    )
  );

create policy advertisements_admin_write on public.advertisements
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.categories (name, slug, description) values
  ('Science', 'science', 'Popular science claims and brain myths'),
  ('Health', 'health', 'Medical and wellness misconceptions'),
  ('History', 'history', 'Historical stories that drifted from the record'),
  ('Technology', 'technology', 'Tech folklore and internet facts'),
  ('Culture', 'culture', 'Everyday sayings and cultural beliefs');

insert into public.myths (title, slug, verdict, explanation, category_id, status)
select
  seed.title,
  seed.slug,
  seed.verdict,
  seed.explanation,
  categories.id,
  'APPROVED'
from (
  values
    (
      'Humans only use 10% of their brain',
      'humans-only-use-10-percent-of-their-brain',
      'FALSE'::public.myth_verdict,
      'Brain imaging and lesion studies show that virtually every region of the brain has a function. Damage in many so-called unused areas still causes clear deficits. The 10% figure is a durable myth, not a measured fact.',
      'science'
    ),
    (
      'You should drink eight glasses of water a day',
      'you-should-drink-eight-glasses-of-water-a-day',
      'PARTIALLY_TRUE'::public.myth_verdict,
      'People need enough fluid, but there is no universal eight-glass rule. Needs vary with body size, climate, activity, and how much water you already get from food and other drinks. Thirst and pale urine are better everyday guides.',
      'health'
    ),
    (
      'Napoleon was extremely short',
      'napoleon-was-extremely-short',
      'FALSE'::public.myth_verdict,
      'Napoleon was around 5 feet 6 or 5 feet 7 inches in modern measure, average for a French man of his time. The short-man story comes from confusing French inches with British inches and from British caricature.',
      'history'
    ),
    (
      'Goldfish have a three-second memory',
      'goldfish-have-a-three-second-memory',
      'FALSE'::public.myth_verdict,
      'Goldfish can remember information for months, learn routes, and recognize cues. The three-second memory claim is a joke that stuck, not a finding from animal behavior research.',
      'science'
    ),
    (
      'Lightning never strikes the same place twice',
      'lightning-never-strikes-the-same-place-twice',
      'FALSE'::public.myth_verdict,
      'Lightning often hits the same tall or conductive place many times. Skyscrapers, towers, and isolated trees are struck repeatedly because they remain the easiest path to ground.',
      'science'
    )
) as seed(title, slug, verdict, explanation, category_slug)
join public.categories on categories.slug = seed.category_slug;

insert into public.sources (myth_id, title, url)
select myths.id, source.title, source.url
from public.myths
join (
  values
    (
      'humans-only-use-10-percent-of-their-brain',
      'Scientific American: Do people only use 10 percent of their brains?',
      'https://www.scientificamerican.com/article/do-people-only-use-10-percent-of-their-brains/'
    ),
    (
      'you-should-drink-eight-glasses-of-water-a-day',
      'Harvard Health: How much water should you drink?',
      'https://www.health.harvard.edu/staying-healthy/how-much-water-should-you-drink'
    ),
    (
      'napoleon-was-extremely-short',
      'Britannica: Was Napoleon short?',
      'https://www.britannica.com/story/was-napoleon-short'
    )
) as source(slug, title, url) on source.slug = myths.slug;
