-- Shared product memory for each household. Names are normalized by the app so
-- "Leche", "leche" and " leche " reuse the same image entry.
create table if not exists public.household_products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  image_url text,
  category text not null default 'Otros',
  purchase_count integer not null default 0 check (purchase_count >= 0),
  last_purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id, normalized_name)
);

create index if not exists household_products_lookup_idx
  on public.household_products(household_id, normalized_name);

alter table public.household_products enable row level security;

drop policy if exists "Members can view household product catalog" on public.household_products;
create policy "Members can view household product catalog"
on public.household_products for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can add household products" on public.household_products;
create policy "Members can add household products"
on public.household_products for insert
to authenticated
with check (public.is_household_member(household_id));

drop policy if exists "Members can update household products" on public.household_products;
create policy "Members can update household products"
on public.household_products for update
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
