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

export async function uploadProductImage(input: {
  householdId: string;
  uri: string;
  contentType?: string | null;
}): Promise<string> {
  const response = await fetch(input.uri);
  const blob = await response.blob();
  const extension = input.contentType?.split('/')[1] || 'jpg';
  const randomPart = Math.random().toString(36).slice(2, 10);
  const path = `${input.householdId}/${Date.now()}-${randomPart}.${extension}`;
  const { error } = await supabase.storage.from('product-images').upload(path, blob, {
    contentType: input.contentType || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}
