export type UserSession = {
  user: {
    id: string;
    email?: string;
  };
};

export type Household = {
  id: string;
  name: string;
  nfc_token: string;
  created_by: string | null;
  created_at: string;
  category_mode_enabled?: boolean;
};

export type HouseholdProduct = {
  id: string;
  household_id: string;
  normalized_name: string;
  display_name: string;
  image_url: string | null;
  category: string;
  purchase_count: number;
  last_purchased_at: string;
  created_at: string;
};

export type ProductCatalogEntry = {
  id: string;
  normalized_name: string;
  display_name: string;
  image_url: string | null;
  category: string;
  purchase_count: number;
  last_purchased_at: string;
  created_at: string;
};

export type HouseholdCategory = {
  id: string;
  name: string;
  emoji: string;
  created_at: string;
  enabled: boolean;
};

export type ShoppingItem = {
  id: string;
  household_id: string;
  name: string;
  quantity: string;
  category: string;
  image_url: string | null;
  is_completed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const ITEM_CATEGORIES = [
  'Fruta',
  'Verdura',
  'Carne y pescado',
  'Lácteos',
  'Panadería',
  'Congelados',
  'Bebidas',
  'Despensa',
  'Snacks',
  'Limpieza',
  'Higiene',
  'Hogar',
  'Mascotas',
  'Bebé',
  'Otros',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
