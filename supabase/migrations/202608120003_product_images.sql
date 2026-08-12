-- Shared optional product images. The URL is stored on the item so every household
-- member sees the same image instead of a device-local file URI.
alter table public.shopping_items
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Files must live under <household_id>/... so membership can be checked.
drop policy if exists "Household members can upload product images" on storage.objects;
create policy "Household members can upload product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
);

-- Public bucket URLs are readable by design; uploads remain restricted to members.
drop policy if exists "Household members can delete product images" on storage.objects;
create policy "Household members can delete product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
);
