import { supabase } from './supabase';
import { getAppBaseUrl } from './app-url';
import { HOUSEHOLD_AUTHORIZATION_PASSWORD } from './authorization';
import type { Household, HouseholdProduct, ItemCategory, ShoppingItem } from '../types';

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

export async function getHouseholdProduct(
  householdId: string,
  name: string,
): Promise<HouseholdProduct | null> {
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) return null;
  const { data, error } = await supabase
    .from('household_products')
    .select('*')
    .eq('household_id', householdId)
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  if (error) throw error;
  return (data as HouseholdProduct | null) ?? null;
}

export async function rememberPurchasedProduct(input: {
  householdId: string;
  name: string;
  category: ItemCategory;
  imageUrl?: string | null;
}): Promise<HouseholdProduct> {
  const normalizedName = normalizeProductName(input.name);
  const existing = await getHouseholdProduct(input.householdId, input.name);
  const { data, error } = await supabase
    .from('household_products')
    .upsert(
      {
        household_id: input.householdId,
        normalized_name: normalizedName,
        display_name: input.name.trim(),
        category: input.category,
        image_url: input.imageUrl ?? existing?.image_url ?? null,
        purchase_count: (existing?.purchase_count ?? 0) + 1,
        last_purchased_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,normalized_name' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as HouseholdProduct;
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
  category: ItemCategory;
  imageUrl?: string | null;
}): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      quantity: input.quantity.trim() || '1',
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
  category: ItemCategory;
  imageUrl?: string | null;
}): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .update({
      name: input.name.trim(),
      quantity: input.quantity.trim() || '1',
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
    .update({ is_completed: completed })
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
