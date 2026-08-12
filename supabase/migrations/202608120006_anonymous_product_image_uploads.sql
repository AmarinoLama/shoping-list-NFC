-- The application intentionally has no Supabase user session. The previous
-- storage policies checked auth.uid()/household membership and caused
-- "new row violates row-level security policy" for camera uploads.
-- The household password is an app-level convenience gate, not backend auth.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg']::text[];

update storage.buckets
set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg']::text[]
where id = 'product-images';

drop policy if exists "Household members can upload product images" on storage.objects;
drop policy if exists "Anyone can upload product images" on storage.objects;
drop policy if exists "Anonymous clients can upload product images" on storage.objects;

-- Paths still include the household id (<household_id>/<file>.jpg), but the
-- anonymous app cannot prove membership through Supabase auth. Keep the check
-- deliberately compatible with the no-account flow and enforce small JPEGs at
-- the bucket level instead.
create policy "Anonymous clients can upload product images"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'product-images'
  and lower(right(name, 4)) = '.jpg'
);
