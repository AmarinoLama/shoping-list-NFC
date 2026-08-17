import { supabase } from './supabase';
import { getAppBaseUrl } from './app-url';
import { HOUSEHOLD_AUTHORIZATION_PASSWORD } from './authorization';
import type { Household, HouseholdCategory, ProductCatalogEntry, ShoppingItem } from '../types';

export const MAX_QUANTITY = 2000;

export function normalizeQuantity(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '1';
  return String(Math.min(MAX_QUANTITY, Math.max(1, Number.parseInt(digits, 10))));
}

export async function getMyHouseholds(): Promise<Household[]> {
  const { data, error } = await supabase.rpc('get_households');
  if (error) throw error;
  return (data ?? []) as Household[];
}

export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc('create_household', {
    household_name: name.trim(),
  });
  if (error) throw error;
  return data as Household;
}

export async function updateHousehold(id: string, name: string): Promise<Household> {
  const { data, error } = await supabase.rpc('update_household', {
    target_household_id: id,
    household_name: name.trim(),
  });
  if (error) throw error;
  return data as Household;
}

export async function deleteHousehold(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_household', {
    target_household_id: id,
  });
  if (error) throw error;
}

export async function joinHouseholdByNfcToken(token: string): Promise<Household> {
  const { data, error } = await supabase.rpc('join_household_by_nfc_token', {
    token: token.trim(),
  });
  if (error) throw error;
  return data as Household;
}

export function normalizeProductName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export async function getHouseholdCategories(householdId: string): Promise<HouseholdCategory[]> {
  const [{ data: categories, error: categoriesError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from('product_categories').select('*').order('created_at', { ascending: true }),
    supabase.from('household_category_settings').select('category_id, enabled').eq('household_id', householdId),
  ]);
  if (categoriesError) throw categoriesError;
  if (settingsError) throw settingsError;
  const enabledByCategory = new Map((settings ?? []).map((setting) => [setting.category_id as string, setting.enabled as boolean]));
  return (categories ?? []).map((category) => ({
    ...category,
    enabled: enabledByCategory.get(category.id) ?? true,
  })) as HouseholdCategory[];
}

export async function createHouseholdCategory(name: string, emoji: string): Promise<HouseholdCategory> {
  const { data, error } = await supabase
    .from('product_categories')
    .insert({ name: name.trim(), emoji: emoji.trim() || '🏷️' })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as HouseholdCategory), enabled: true };
}

export async function updateHouseholdCategory(id: string, name: string, emoji: string): Promise<HouseholdCategory> {
  const { data, error } = await supabase.rpc('rename_product_category', {
    target_category_id: id,
    category_name: name.trim(),
    category_emoji: emoji.trim() || '🏷️',
  });
  if (error) throw error;
  return { ...(data as HouseholdCategory), enabled: true };
}

export async function deleteHouseholdCategory(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_product_category', {
    target_category_id: id,
  });
  if (error) throw error;
}

export async function setHouseholdCategoryEnabled(householdId: string, categoryId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const { error } = await supabase
      .from('household_category_settings')
      .upsert({ household_id: householdId, category_id: categoryId, enabled: true });
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('household_category_settings')
    .upsert({ household_id: householdId, category_id: categoryId, enabled: false });
  if (error) throw error;
}

export async function setHouseholdCategoryMode(householdId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_household_category_mode', {
    target_household_id: householdId,
    enabled,
  });
  if (error) throw error;
}

export async function searchProductCatalog(name: string): Promise<ProductCatalogEntry[]> {
  const normalizedName = normalizeProductName(name);
  if (normalizedName.length < 2) return [];
  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .ilike('normalized_name', `${normalizedName}%`)
    .order('purchase_count', { ascending: false })
    .order('display_name', { ascending: true })
    .limit(6);
  if (error) throw error;
  return (data ?? []) as ProductCatalogEntry[];
}

export async function rememberProductCatalog(input: {
  name: string;
  category: string;
}): Promise<ProductCatalogEntry> {
  const normalizedName = normalizeProductName(input.name);
  const { data: existing, error: lookupError } = await supabase
    .from('product_catalog')
    .select('purchase_count')
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const { data, error } = await supabase
    .from('product_catalog')
    .upsert(
      {
        normalized_name: normalizedName,
        display_name: input.name.trim(),
        category: input.category,
        image_url: null,
        purchase_count: (existing?.purchase_count ?? 0) + 1,
        last_purchased_at: new Date().toISOString(),
      },
      { onConflict: 'normalized_name' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as ProductCatalogEntry;
}

export async function getShoppingItems(householdId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('household_id', householdId)
    .order('is_completed', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShoppingItem[];
}

export async function addShoppingItem(input: {
  householdId: string;
  name: string;
  quantity: string;
  quantityUnit: string;
  category: string;
  imageUrl?: string | null;
}): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      quantity: normalizeQuantity(input.quantity),
      quantity_unit: input.quantityUnit.trim() || 'unidades',
      category: input.category,
      image_url: input.imageUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ShoppingItem;
}

export async function updateShoppingItem(input: {
  id: string;
  name: string;
  quantity: string;
  quantityUnit: string;
  category: string;
  imageUrl?: string | null;
}): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .update({
      name: input.name.trim(),
      quantity: normalizeQuantity(input.quantity),
      quantity_unit: input.quantityUnit.trim() || 'unidades',
      category: input.category,
      image_url: input.imageUrl,
    })
    .eq('id', input.id)
    .select()
    .single();
  if (error) throw error;
  return data as ShoppingItem;
}

export async function setItemCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update(completed ? { is_completed: true, image_url: null } : { is_completed: false })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
}

export async function clearCompletedItems(householdId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .delete()
    .eq('household_id', householdId)
    .eq('is_completed', true);
  if (error) throw error;
}

export function subscribeToShoppingItems(householdId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`shopping-items:${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_items',
        filter: `household_id=eq.${householdId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export const isNfcBaseUrlConfigured = Boolean(process.env.EXPO_PUBLIC_NFC_BASE_URL);

export function getNfcInviteUrl(token: string): string {
  // Usa el dominio NFC configurado si existe; si no, apunta a la URL real
  // donde corre la app (evita quedarse anclado a un dominio anterior).
  const configuredBase = process.env.EXPO_PUBLIC_NFC_BASE_URL?.trim();
  const baseUrl = configuredBase || getAppBaseUrl();
  const access = encodeURIComponent(HOUSEHOLD_AUTHORIZATION_PASSWORD);
  return `${baseUrl.replace(/\/$/, '')}/join/${encodeURIComponent(token)}?access=${access}`;
}

export type NfcInvite = {
  token: string;
  authorizationPassword: string | null;
};

export function parseNfcInvite(url: string | null): NfcInvite | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const queryToken = parsed.searchParams.get('token');
    const parts = parsed.pathname.split('/').filter(Boolean);
    const joinIndex = parts.findIndex((part) => part === 'join');
    const pathToken = parsed.hostname === 'join'
      ? parts[0]
      : joinIndex >= 0
        ? parts[joinIndex + 1]
        : undefined;
    const token = queryToken || pathToken;
    if (!token) return null;
    return {
      token: decodeURIComponent(token),
      authorizationPassword:
        parsed.searchParams.get('access') ?? parsed.searchParams.get('password'),
    };
  } catch {
    const match = url.match(/(?:join|token)[/:=]([^/?#]+)/i);
    return match?.[1]
      ? { token: decodeURIComponent(match[1]), authorizationPassword: null }
      : null;
  }
}

export function parseNfcToken(url: string | null): string | null {
  return parseNfcInvite(url)?.token ?? null;
}
