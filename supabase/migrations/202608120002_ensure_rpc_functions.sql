-- Arregla el error 404 PGRST202 ("Could not find the function ... in the schema cache")
-- al llamar a create_household / join_household_by_nfc_token / get_my_households.
--
-- Si la migración inicial (202608120001) no se aplicó completa en tu proyecto,
-- estas funciones no existen en la base de datos aunque la app las llame por RPC.
-- Este archivo las (re)crea y es seguro ejecutarlo varias veces (idempotente).
--
-- Cómo aplicarlo: abre el SQL Editor de tu proyecto Supabase, pega TODO el
-- contenido de este archivo y ejecútalo. Después vuelve a probar "Crear hogar".
--
-- Nota: estas funciones usan las tablas public.households y
-- public.household_members. Si tu base de datos está completamente vacía,
-- aplica primero 202608120001_initial_schema.sql y después este archivo.

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

-- Los permisos se reaplican para no depender del estado anterior.
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.create_household(text) from public;
revoke execute on function public.join_household_by_nfc_token(text) from public;
revoke execute on function public.get_my_households() from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household_by_nfc_token(text) to authenticated;
grant execute on function public.get_my_households() to authenticated;
