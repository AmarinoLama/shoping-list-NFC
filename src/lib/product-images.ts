import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export async function deleteProductImage(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const marker = '/storage/v1/object/public/product-images/';
  const markerIndex = publicUrl.indexOf(marker);
  if (markerIndex < 0) return;

  const path = decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
  if (!path) return;
  const { error } = await supabase.storage.from('product-images').remove([path]);
  if (error) throw error;
}

export async function uploadProductImage(input: {
  householdId: string;
  uri: string;
  width?: number;
}): Promise<string> {
  let uploadUri = input.uri;

  // The native picker already offers the crop editor. This second pass keeps
  // every camera/gallery image small and in one predictable format.
  try {
    const optimized = await manipulateAsync(
      input.uri,
      input.width && input.width > 900 ? [{ resize: { width: 900 } }] : [],
      { compress: 0.55, format: SaveFormat.JPEG },
    );
    uploadUri = optimized.uri;
  } catch {
    // If a platform cannot manipulate the local URI, try the original file.
  }

  const response = await fetch(uploadUri);
  const blob = await response.blob();
  const randomPart = Math.random().toString(36).slice(2, 10);
  const path = `${input.householdId}/${Date.now()}-${randomPart}.jpg`;
  const { error } = await supabase.storage.from('product-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}
