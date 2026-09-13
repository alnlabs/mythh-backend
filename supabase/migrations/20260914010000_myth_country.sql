alter table public.myths
  add column if not exists country_code text;

create index if not exists myths_country_status_idx
  on public.myths (country_code, status, created_at desc);

comment on column public.myths.country_code is
  'ISO 3166-1 alpha-2 country this claim is aimed at. Null means worldwide.';
