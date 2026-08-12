-- The app uses the shared household password instead of user accounts.
-- Supabase's anon key is still required to reach the database, but no auth.users
-- session is needed for the app flow.
alter table public.households alter column created_by drop not null;
alter table public.shopping_items alter column created_by drop not null;
alter table public.shopping_items add column if not exists image_url text;

-- Keep this migration safe to run on projects that skipped the optional image/catalog migrations.
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

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

create or replace function public.get_households()
returns setof public.households
language sql
stable
security definer
set search_path = public
as $$
  select * from public.households order by created_at asc;
$$;

create or replace function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household public.households;
begin
  insert into public.households (name, created_by)
  values (trim(household_name), null)
  returning * into created_household;
  return created_household;
end;
$$;

create or replace function public.join_household_by_nfc_token(token text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.households;
begin
  select * into target
  from public.households
  where nfc_token = trim(token);
  if target.id is null then
    raise exception 'NFC invitation not found';
  end if;
  return target;
end;
$$;

revoke all on function public.get_households() from public;
revoke all on function public.create_household(text) from public;
revoke all on function public.join_household_by_nfc_token(text) from public;
grant execute on function public.get_households() to anon, authenticated;
grant execute on function public.create_household(text) to anon, authenticated;
grant execute on function public.join_household_by_nfc_token(text) to anon, authenticated;

drop policy if exists "Members can view their households" on public.households;
drop policy if exists "Anyone can view households" on public.households;
create policy "Anyone can view households"
on public.households for select
to anon, authenticated
using (true);

drop policy if exists "Members can view shopping items" on public.shopping_items;
drop policy if exists "Members can add shopping items" on public.shopping_items;
drop policy if exists "Members can update shopping items" on public.shopping_items;
drop policy if exists "Members can delete shopping items" on public.shopping_items;
drop policy if exists "Anyone can view shopping items" on public.shopping_items;
drop policy if exists "Anyone can add shopping items" on public.shopping_items;
drop policy if exists "Anyone can update shopping items" on public.shopping_items;
drop policy if exists "Anyone can delete shopping items" on public.shopping_items;
create policy "Anyone can view shopping items"
on public.shopping_items for select
to anon, authenticated
using (true);
create policy "Anyone can add shopping items"
on public.shopping_items for insert
to anon, authenticated
with check (exists (select 1 from public.households h where h.id = household_id));
create policy "Anyone can update shopping items"
on public.shopping_items for update
to anon, authenticated
using (true)
with check (true);
create policy "Anyone can delete shopping items"
on public.shopping_items for delete
to anon, authenticated
using (true);

-- Product catalog access follows the same house-password model.
drop policy if exists "Members can view household product catalog" on public.household_products;
drop policy if exists "Members can add household products" on public.household_products;
drop policy if exists "Members can update household products" on public.household_products;
drop policy if exists "Anyone can view household product catalog" on public.household_products;
drop policy if exists "Anyone can add household products" on public.household_products;
drop policy if exists "Anyone can update household products" on public.household_products;
create policy "Anyone can view household product catalog"
on public.household_products for select
to anon, authenticated
using (true);
create policy "Anyone can add household products"
on public.household_products for insert
to anon, authenticated
with check (exists (select 1 from public.households h where h.id = household_id));
create policy "Anyone can update household products"
on public.household_products for update
to anon, authenticated
using (true)
with check (true);

-- Product image uploads are scoped to an existing household folder. The public
-- password is an app-level UX gate, not a substitute for server-side auth.
drop policy if exists "Household members can upload product images" on storage.objects;
drop policy if exists "Anyone can upload product images" on storage.objects;
create policy "Anyone can upload product images"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.households h
    where h.id = (storage.foldername(name))[1]::uuid
  )
);
