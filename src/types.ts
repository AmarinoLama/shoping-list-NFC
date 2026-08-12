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
  created_by: string;
  created_at: string;
};

export type ShoppingItem = {
  id: string;
  household_id: string;
  name: string;
  quantity: string;
  category: string;
  is_completed: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const ITEM_CATEGORIES = [
  'Fruta',
  'Verdura',
  'Lácteos',
  'Despensa',
  'Hogar',
  'Otros',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
