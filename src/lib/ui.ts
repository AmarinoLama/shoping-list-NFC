import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ItemCategory } from '../types';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type { IconName };

/**
 * Paleta compartida de la app. Verde oscuro + lima, con acentos vivos
 * para que cada sección tenga personalidad.
 */
export const COLORS = {
  bg: '#071312',
  panel: '#10231f',
  panelDeep: '#0a1917',
  line: '#1d3631',
  lineSoft: '#294740',
  lime: '#a7f36a',
  limeDeep: '#c1e7a3',
  text: '#f2f7f4',
  textSoft: '#dcefe2',
  muted: '#8ca39c',
  mutedDeep: '#718b85',
  danger: '#ff9d92',
  cyan: '#7fe7d4',
  violet: '#b8a4ff',
  amber: '#ffd08a',
  pink: '#ff9ecf',
} as const;

/** Emoji + icono (MaterialCommunityIcons) para cada categoría de la lista. */
export const CATEGORY_META: Record<ItemCategory, { emoji: string; icon: IconName }> = {
  Fruta: { emoji: '🍎', icon: 'fruit-cherries' },
  Verdura: { emoji: '🥕', icon: 'carrot' },
  Lácteos: { emoji: '🧀', icon: 'cheese' },
  Despensa: { emoji: '🥫', icon: 'shopping' },
  Hogar: { emoji: '🧺', icon: 'broom' },
  Otros: { emoji: '🛍️', icon: 'dots-horizontal-circle' },
};
