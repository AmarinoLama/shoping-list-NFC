import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export type ProductImageCandidate = {
  url: string;
  productName: string;
  source: 'transparent' | 'catalog' | 'saved';
};

const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

export async function searchProductImages(query: string): Promise<ProductImageCandidate[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const params = new URLSearchParams({
      search_terms: cleanQuery,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '8',
      fields: 'product_name,image_front_transparent_url,image_front_small_url,image_front_url',
    });
    const response = await fetch(`${OPEN_FOOD_FACTS_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      products?: Array<{
        product_name?: string;
        image_front_transparent_url?: string;
        image_front_small_url?: string;
        image_front_url?: string;
      }>;
    };

    const candidates: ProductImageCandidate[] = [];
    for (const product of payload.products ?? []) {
      const transparentUrl = product.image_front_transparent_url?.trim();
      const catalogUrl = product.image_front_small_url?.trim() || product.image_front_url?.trim();
      const url = transparentUrl || catalogUrl;
      if (!url || candidates.some((candidate) => candidate.url === url)) continue;
      candidates.push({
        url,
        productName: product.product_name?.trim() || cleanQuery,
        source: transparentUrl ? 'transparent' : 'catalog',
      });
    }
    return candidates;
  } catch {
    // Image search is optional: a network/API failure must never block adding food.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

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
