create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  nfc_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

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
  is_completed boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);
create index if not exists shopping_items_household_id_idx on public.shopping_items(household_id);
create index if not exists shopping_items_pending_idx on public.shopping_items(household_id, is_completed);

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

create or replace function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household public.households;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  insert into public.households (name, created_by)
  values (trim(household_name), auth.uid())
  returning * into created_household;

  insert into public.household_members (household_id, user_id, role)
  values (created_household.id, auth.uid(), 'owner');

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
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select * into target
  from public.households
  where nfc_token = trim(token);

  if target.id is null then
    raise exception 'NFC invitation not found';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target.id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return target;
end;
$$;

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
  if new.household_id <> old.household_id or new.created_by <> old.created_by then
    raise exception 'Item ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_items_protect_identity on public.shopping_items;
create trigger shopping_items_protect_identity
before update on public.shopping_items
for each row execute function public.protect_shopping_item_identity();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "Members can view their households" on public.households;
create policy "Members can view their households"
on public.households for select
using (public.is_household_member(id));

drop policy if exists "Members can view household membership" on public.household_members;
create policy "Members can view household membership"
on public.household_members for select
using (public.is_household_member(household_id));

drop policy if exists "Members can view shopping items" on public.shopping_items;
create policy "Members can view shopping items"
on public.shopping_items for select
using (public.is_household_member(household_id));

drop policy if exists "Members can add shopping items" on public.shopping_items;
create policy "Members can add shopping items"
on public.shopping_items for insert
with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
);

drop policy if exists "Members can update shopping items" on public.shopping_items;
create policy "Members can update shopping items"
on public.shopping_items for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can delete shopping items" on public.shopping_items;
create policy "Members can delete shopping items"
on public.shopping_items for delete
using (public.is_household_member(household_id));

revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.create_household(text) from public;
revoke execute on function public.join_household_by_nfc_token(text) from public;
revoke execute on function public.get_my_households() from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household_by_nfc_token(text) to authenticated;
grant execute on function public.get_my_households() to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;

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
