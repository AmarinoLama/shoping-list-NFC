-- Lista de Casa - database schema
--
-- Ejecuta TODO este archivo una sola vez en Supabase > SQL Editor.
-- Es idempotente y sirve tanto para un proyecto vacío como para uno que
-- tuviera alguna versión anterior del esquema.
--
-- La aplicación no usa cuentas ni sesiones de Supabase. La contraseña de la
-- casa es una barrera de interfaz; anon/authenticated reciben los permisos
-- necesarios para el flujo compartido.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  nfc_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  emoji text not null default '🏷️',
  created_at timestamptz not null default now()
);

create unique index if not exists household_categories_name_idx
  on public.household_categories(household_id, lower(name));

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity text not null default '1',
  category text not null default 'Otros',
  image_url text,
  is_completed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Global memory shared by every house. Names, categories and purchase counts
-- survive across households; photos are intentionally not retained here.
create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null,
  image_url text,
  category text not null default 'Otros',
  purchase_count integer not null default 0 check (purchase_count >= 0),
  last_purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Migrate names remembered by older versions into the global catalog.
insert into public.product_catalog (
  normalized_name,
  display_name,
  category,
  purchase_count,
  last_purchased_at
)
select distinct on (normalized_name)
  normalized_name,
  display_name,
  category,
  sum(purchase_count) over (partition by normalized_name),
  max(last_purchased_at) over (partition by normalized_name)
from public.household_products
order by normalized_name, last_purchased_at desc
on conflict (normalized_name) do update set
  purchase_count = greatest(public.product_catalog.purchase_count, excluded.purchase_count),
  last_purchased_at = greatest(public.product_catalog.last_purchased_at, excluded.last_purchased_at);

-- Compatibility with the old account-based schema.
alter table public.households alter column created_by drop not null;
alter table public.shopping_items alter column created_by drop not null;
alter table public.shopping_items add column if not exists image_url text;

create index if not exists household_members_user_id_idx
  on public.household_members(user_id);
create index if not exists household_categories_household_id_idx
  on public.household_categories(household_id);
create index if not exists shopping_items_household_id_idx
  on public.shopping_items(household_id);
create index if not exists shopping_items_pending_idx
  on public.shopping_items(household_id, is_completed);
create index if not exists household_products_lookup_idx
  on public.household_products(household_id, normalized_name);
create index if not exists product_catalog_lookup_idx
  on public.product_catalog(normalized_name text_pattern_ops);

-- ---------------------------------------------------------------------------
-- Triggers and helper functions
-- ---------------------------------------------------------------------------

create or replace function public.touch_shopping_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shopping_items_touch_updated_at on public.shopping_items;
create trigger shopping_items_touch_updated_at
before update on public.shopping_items
for each row execute function public.touch_shopping_item();

create or replace function public.protect_shopping_item_identity()
returns trigger
language plpgsql
as $$
begin
  if new.household_id <> old.household_id
     or (new.created_by is distinct from old.created_by) then
    raise exception 'Item ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_items_protect_identity on public.shopping_items;
create trigger shopping_items_protect_identity
before update on public.shopping_items
for each row execute function public.protect_shopping_item_identity();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC API used by the app
-- ---------------------------------------------------------------------------

create or replace function public.rename_household_category(
  target_category_id uuid,
  category_name text
)
returns public.household_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  current_category public.household_categories;
  updated_category public.household_categories;
begin
  if char_length(trim(category_name)) < 1 then
    raise exception 'Category name cannot be empty';
  end if;

  select * into current_category
  from public.household_categories
  where id = target_category_id;

  if current_category.id is null then
    raise exception 'Category not found';
  end if;

  update public.household_categories
  set name = trim(category_name)
  where id = target_category_id
  returning * into updated_category;

  update public.shopping_items
  set category = updated_category.name
  where household_id = current_category.household_id
    and category = current_category.name;

  return updated_category;
end;
$$;

create or replace function public.delete_household_category(target_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_category public.household_categories;
begin
  select * into current_category
  from public.household_categories
  where id = target_category_id;

  if current_category.id is null then
    raise exception 'Category not found';
  end if;

  update public.shopping_items
  set category = 'Sin categoría'
  where household_id = current_category.household_id
    and category = current_category.name;

  delete from public.household_categories where id = target_category_id;
end;
$$;

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
  if char_length(trim(household_name)) < 1 then
    raise exception 'Household name cannot be empty';
  end if;

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

create or replace function public.update_household(
  target_household_id uuid,
  household_name text
)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_household public.households;
begin
  if char_length(trim(household_name)) < 1 then
    raise exception 'Household name cannot be empty';
  end if;

  update public.households
  set name = trim(household_name)
  where id = target_household_id
  returning * into updated_household;

  if updated_household.id is null then
    raise exception 'Household not found';
  end if;

  return updated_household;
end;
$$;

create or replace function public.delete_household(target_household_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.households where id = target_household_id;
$$;

-- Legacy function kept harmlessly for projects that used the old schema.
create or replace function public.get_my_households()
returns setof public.households
language sql
stable
security definer
set search_path = public
as $$
  select h.*
  from public.households h
  join public.household_members hm on hm.household_id = h.id
  where hm.user_id = auth.uid()
  order by h.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_categories enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items enable row level security;
alter table public.household_products enable row level security;
alter table public.product_catalog enable row level security;

-- Remove policies created by both the old account flow and previous anonymous
-- migrations before installing the final policy set.
drop policy if exists "Members can view their households" on public.households;
drop policy if exists "Anyone can view households" on public.households;
create policy "Anyone can view households"
on public.households for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can view household categories" on public.household_categories;
drop policy if exists "Anyone can add household categories" on public.household_categories;
drop policy if exists "Anyone can update household categories" on public.household_categories;
drop policy if exists "Anyone can delete household categories" on public.household_categories;
create policy "Anyone can view household categories"
on public.household_categories for select
to anon, authenticated
using (true);
create policy "Anyone can add household categories"
on public.household_categories for insert
to anon, authenticated
with check (exists (
  select 1 from public.households h where h.id = household_id
));
create policy "Anyone can update household categories"
on public.household_categories for update
to anon, authenticated
using (true)
with check (true);
create policy "Anyone can delete household categories"
on public.household_categories for delete
to anon, authenticated
using (true);

drop policy if exists "Members can view household membership" on public.household_members;
-- household_members is not used by the app and remains private.

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
with check (exists (
  select 1 from public.households h where h.id = household_id
));
create policy "Anyone can update shopping items"
on public.shopping_items for update
to anon, authenticated
using (true)
with check (true);
create policy "Anyone can delete shopping items"
on public.shopping_items for delete
to anon, authenticated
using (true);

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
with check (exists (
  select 1 from public.households h where h.id = household_id
));
create policy "Anyone can update household products"
on public.household_products for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Anyone can view product catalog" on public.product_catalog;
drop policy if exists "Anyone can add product catalog entries" on public.product_catalog;
drop policy if exists "Anyone can update product catalog entries" on public.product_catalog;
create policy "Anyone can view product catalog"
on public.product_catalog for select
to anon, authenticated
using (true);
create policy "Anyone can add product catalog entries"
on public.product_catalog for insert
to anon, authenticated
with check (true);
create policy "Anyone can update product catalog entries"
on public.product_catalog for update
to anon, authenticated
using (true)
with check (true);

-- Supabase requires table privileges in addition to RLS policies.
grant usage on schema public to anon, authenticated;
grant select on public.households to anon, authenticated;
grant select, insert, update, delete on public.household_categories to anon, authenticated;
grant select, insert, update, delete on public.shopping_items to anon, authenticated;
grant select, insert, update on public.household_products to anon, authenticated;
grant select, insert, update on public.product_catalog to anon, authenticated;
revoke all on public.household_members from anon, authenticated;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

revoke all on function public.rename_household_category(uuid, text) from public;
revoke all on function public.delete_household_category(uuid) from public;
grant execute on function public.rename_household_category(uuid, text) to anon, authenticated;
grant execute on function public.delete_household_category(uuid) to anon, authenticated;

revoke all on function public.get_households() from public;
revoke all on function public.create_household(text) from public;
revoke all on function public.join_household_by_nfc_token(text) from public;
revoke all on function public.update_household(uuid, text) from public;
revoke all on function public.delete_household(uuid) from public;
revoke all on function public.get_my_households() from public;
grant execute on function public.get_households() to anon, authenticated;
grant execute on function public.create_household(text) to anon, authenticated;
grant execute on function public.join_household_by_nfc_token(text) to anon, authenticated;
grant execute on function public.update_household(uuid, text) to anon, authenticated;
grant execute on function public.delete_household(uuid) to anon, authenticated;
grant execute on function public.get_my_households() to authenticated;

-- ---------------------------------------------------------------------------
-- Product image Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  2097152,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg']::text[];

-- Remove all previous upload policies before installing the anonymous one.
drop policy if exists "Household members can upload product images" on storage.objects;
drop policy if exists "Household members can delete product images" on storage.objects;
drop policy if exists "Anyone can upload product images" on storage.objects;
drop policy if exists "Anonymous clients can upload product images" on storage.objects;
drop policy if exists "Anonymous clients can delete product images" on storage.objects;
create policy "Anonymous clients can upload product images"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'product-images'
  and lower(right(name, 4)) = '.jpg'
);
create policy "Anonymous clients can delete product images"
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'product-images'
  and lower(right(name, 4)) = '.jpg'
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end
$$;
