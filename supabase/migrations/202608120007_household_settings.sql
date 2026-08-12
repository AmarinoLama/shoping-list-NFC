-- Household management for the no-account app flow.
-- The authorization password is handled by the app UI; these RPCs follow the
-- same anonymous model as the existing household functions.

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

revoke all on function public.update_household(uuid, text) from public;
revoke all on function public.delete_household(uuid) from public;
grant execute on function public.update_household(uuid, text) to anon, authenticated;
grant execute on function public.delete_household(uuid) to anon, authenticated;
