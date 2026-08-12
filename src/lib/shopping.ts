import { supabase } from './supabase';
import { getAppBaseUrl } from './app-url';
import type { Household, ItemCategory, ShoppingItem } from '../types';

export async function getMyHouseholds(): Promise<Household[]> {
  const { data, error } = await supabase.rpc('get_my_households');
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

export async function joinHouseholdByNfcToken(token: string): Promise<Household> {
  const { data, error } = await supabase.rpc('join_household_by_nfc_token', {
    token: token.trim(),
  });
  if (error) throw error;
  return data as Household;
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
  userId: string;
  name: string;
  quantity: string;
  category: ItemCategory;
}): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      household_id: input.householdId,
      created_by: input.userId,
      name: input.name.trim(),
      quantity: input.quantity.trim() || '1',
      category: input.category,
    })
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
  return `${baseUrl.replace(/\/$/, '')}/join/${encodeURIComponent(token)}`;
}

export function parseNfcToken(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const queryToken = parsed.searchParams.get('token');
    if (queryToken) return queryToken;
    if (parsed.hostname === 'join') {
      return decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] ?? '') || null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    const joinIndex = parts.findIndex((part) => part === 'join');
    return joinIndex >= 0 ? decodeURIComponent(parts[joinIndex + 1] ?? '') || null : null;
  } catch {
    const match = url.match(/(?:join|token)[/:=]([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}
