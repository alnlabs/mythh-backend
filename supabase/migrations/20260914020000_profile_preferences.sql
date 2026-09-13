alter table public.profiles
  add column if not exists country_code text,
  add column if not exists default_category_id uuid references public.categories (id) on delete set null;

create index if not exists profiles_country_code_idx on public.profiles (country_code);
