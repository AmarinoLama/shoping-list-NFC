import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text as NativeText,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addShoppingItem,
  clearCompletedItems,
  createHouseholdCategory,
  deleteHouseholdCategory,
  deleteShoppingItem,
  getHouseholdCategories,
  getShoppingItems,
  MAX_QUANTITY,
  normalizeQuantity,
  rememberProductCatalog,
  searchProductCatalog,
  setHouseholdCategoryEnabled,
  setHouseholdCategoryMode,
  setItemCompleted,
  subscribeToShoppingItems,
  updateHouseholdCategory,
  updateShoppingItem,
} from '../lib/shopping';
import { deleteProductImage, uploadProductImage } from '../lib/product-images';
import { CATEGORY_META, COLORS } from '../lib/ui';
import type { Household, HouseholdCategory, ItemCategory, ProductCatalogEntry, ShoppingItem } from '../types';

type Props = {
  household: Household;
  onChangeHouse: () => void;
};

type AccessibleTextProps = ComponentProps<typeof NativeText>;

const FontScaleContext = createContext(1);
const FONT_SCALE_STORAGE_KEY = '@lista-casa/font-scale';
const FONT_SCALE_OPTIONS = [
  { value: 1, label: 'Normal', sample: 'Aa' },
  { value: 1.15, label: 'Grande', sample: 'Aa' },
  { value: 1.3, label: 'Muy grande', sample: 'Aa' },
];

function Text({ style, ...props }: AccessibleTextProps) {
  const scale = useContext(FontScaleContext);
  const flattened = StyleSheet.flatten(style) as { fontSize?: number; lineHeight?: number } | undefined;
  const scaledStyle = scale === 1 || !flattened
    ? style
    : [
        style,
        flattened.fontSize ? { fontSize: flattened.fontSize * scale } : null,
        flattened.lineHeight ? { lineHeight: flattened.lineHeight * scale } : null,
      ];
  return <NativeText {...props} style={scaledStyle} />;
}

type CategoryGroup = {
  category: string;
  items: ShoppingItem[];
  pendingCount: number;
};

const CONFETTI_COLORS = [COLORS.lime, COLORS.cyan, COLORS.amber, COLORS.pink, COLORS.violet];
const CONFETTI_EMOJI = ['⭐', '🛒', '🎉', '🧃'];
const QUANTITY_OPTIONS = Array.from({ length: MAX_QUANTITY }, (_, index) => String(index + 1));
const QUANTITY_UNIT_OPTIONS = [
  { value: 'unidades', label: 'Unidades' },
  { value: 'g', label: 'Gramos' },
  { value: 'kg', label: 'Kilos' },
  { value: 'ml', label: 'Mililitros' },
  { value: 'l', label: 'Litros' },
  { value: 'paquetes', label: 'Paquetes' },
  { value: 'cajas', label: 'Cajas' },
  { value: 'botellas', label: 'Botellas' },
  { value: 'latas', label: 'Latas' },
  { value: 'sobres', label: 'Sobres' },
] as const;
const CATEGORY_EMOJI_OPTIONS = ['🏷️', '🍎', '🥕', '🥩', '🧀', '🥖', '❄️', '🥤', '🥫', '🍪', '🧴', '🧺', '🐾', '🍼', '🏠', '✨'];
const QUANTITY_ITEM_HEIGHT = 48;

function formatQuantity(quantity: string, unit?: string): string {
  const value = normalizeQuantity(quantity);
  const normalizedUnit = unit?.trim() || 'unidades';
  return normalizedUnit === 'unidades' ? `x${value}` : `${value} ${normalizedUnit}`;
}

export function ListScreen({ household, onChangeHouse }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [quantityUnit, setQuantityUnit] = useState('unidades');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editQuantityUnit, setEditQuantityUnit] = useState('unidades');
  const [editCategory, setEditCategory] = useState('');
  const [quantityPickerTarget, setQuantityPickerTarget] = useState<'new' | 'edit' | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [catalogSuggestions, setCatalogSuggestions] = useState<ProductCatalogEntry[]>([]);
  const [catalogSearchBusy, setCatalogSearchBusy] = useState(false);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [householdCategories, setHouseholdCategories] = useState<HouseholdCategory[]>([]);
  const [categoryModeEnabled, setCategoryModeEnabled] = useState(household.category_mode_enabled !== false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<HouseholdCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryEmoji, setCategoryEmoji] = useState('🏷️');
  const [confirmingCategoryDelete, setConfirmingCategoryDelete] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const catalogSearchRequest = useRef(0);
  const quantityListRef = useRef<FlatList<string> | null>(null);

  const headerIn = useRef(new Animated.Value(0)).current;
  const progressMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerIn, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [headerIn]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY)
      .then((storedScale) => {
        const parsedScale = Number(storedScale);
        if (active && FONT_SCALE_OPTIONS.some((option) => option.value === parsedScale)) {
          setFontScale(parsedScale);
        }
      })
      .catch(() => {
        // La preferencia visual es opcional; usamos el tamaño normal si no se puede leer.
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateFontScale(nextScale: number): Promise<void> {
    setFontScale(nextScale);
    try {
      await AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(nextScale));
    } catch {
      // El ajuste sigue activo durante esta sesión aunque no se pueda guardar.
    }
  }

  async function refresh(): Promise<void> {
    try {
      const [loadedItems, loadedCategories] = await Promise.all([
        getShoppingItems(household.id),
        getHouseholdCategories(household.id),
      ]);
      setItems(loadedItems);
      setHouseholdCategories(loadedCategories);
      const modeEnabled = household.category_mode_enabled !== false;
      setCategoryModeEnabled(modeEnabled);
      const firstEnabledCategory = loadedCategories.find((option) => option.enabled)?.name ?? '';
      setCategory((current) => modeEnabled && loadedCategories.some((option) => option.enabled && option.name === current)
        ? current
        : modeEnabled ? firstEnabledCategory : 'Sin categoría');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar la lista.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void refresh();
    const unsubscribe = subscribeToShoppingItems(household.id, () => void refresh());
    return unsubscribe;
  }, [household.id]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = showCompleted || !item.is_completed;
      const matchesSearch = !query || `${item.name} ${item.category}`.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, showCompleted]);

  const groupedItems = useMemo<CategoryGroup[]>(() => {
    const groups = new Map<string, ShoppingItem[]>();
    const enabledNames = new Set(
      householdCategories.filter((option) => option.enabled).map((option) => option.name),
    );
    visibleItems.forEach((item) => {
      const displayCategory = enabledNames.has(item.category) ? item.category : 'Sin categoría';
      const group = groups.get(displayCategory) ?? [];
      group.push(item);
      groups.set(displayCategory, group);
    });

    const orderedCategories = [
      ...householdCategories.filter((option) => option.enabled).map((option) => option.name),
      'Sin categoría',
      ...Array.from(groups.keys()).filter((category) => !householdCategories.some((option) => option.enabled && option.name === category) && category !== 'Sin categoría'),
    ];
    return orderedCategories.flatMap((category) => {
      const categoryItems = groups.get(category);
      if (!categoryItems?.length) return [];
      return [{
        category,
        items: categoryItems,
        pendingCount: categoryItems.filter((item) => !item.is_completed).length,
      }];
    });
  }, [visibleItems, householdCategories]);

  const pendingCount = items.filter((item) => !item.is_completed).length;
  const completedCount = items.length - pendingCount;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;

  useEffect(() => {
    Animated.spring(progressMotion, {
      toValue: progress,
      friction: 8,
      tension: 55,
      useNativeDriver: false,
    }).start();
  }, [progress, progressMotion]);

  function setPickerQuantity(value: string, scroll = true): void {
    const nextQuantity = normalizeQuantity(value);
    if (quantityPickerTarget === 'edit') setEditQuantity(nextQuantity);
    else setQuantity(nextQuantity);
    if (scroll) {
      const index = Number(nextQuantity) - 1;
      quantityListRef.current?.scrollToOffset({ offset: index * QUANTITY_ITEM_HEIGHT, animated: true });
    }
  }

  function handlePickerQuantityInput(value: string): void {
    const digits = value.replace(/[^0-9]/g, '').slice(0, String(MAX_QUANTITY).length);
    if (!digits) {
      if (quantityPickerTarget === 'edit') setEditQuantity('');
      else setQuantity('');
      return;
    }
    setPickerQuantity(digits);
  }

  useEffect(() => {
    if (quantityPickerTarget === null) return;
    const nextQuantity = normalizeQuantity(pickerQuantity);
    if (quantityPickerTarget === 'edit') setEditQuantity(nextQuantity);
    else setQuantity(nextQuantity);
    const index = Number(nextQuantity) - 1;
    const timeout = setTimeout(() => {
      quantityListRef.current?.scrollToOffset({ offset: index * QUANTITY_ITEM_HEIGHT, animated: false });
    }, 40);
    return () => clearTimeout(timeout);
  }, [quantityPickerTarget]);

  useEffect(() => {
    const requestId = ++catalogSearchRequest.current;
    const query = name.trim();
    setCatalogSuggestions([]);
    if (query.length < 2) {
      setCatalogSearchBusy(false);
      return;
    }
    const timeout = setTimeout(() => {
      setCatalogSearchBusy(true);
      void searchProductCatalog(query)
        .then((suggestions) => {
          if (catalogSearchRequest.current === requestId) setCatalogSuggestions(suggestions);
        })
        .catch(() => {
          // El autocompletado es opcional y no debe bloquear la creación del producto.
        })
        .finally(() => {
          if (catalogSearchRequest.current === requestId) setCatalogSearchBusy(false);
        });
    }, 450);
    return () => clearTimeout(timeout);
  }, [name]);

  function startEditing(item: ShoppingItem): void {
    setEditingItem(item);
    setEditName(item.name);
    setEditQuantity(normalizeQuantity(item.quantity || '1'));
    setEditQuantityUnit(item.quantity_unit || 'unidades');
    setEditCategory(item.category);
    setError(null);
  }

  function cancelEditing(): void {
    setEditingItem(null);
    setEditName('');
    setError(null);
  }

  function openQuantityPicker(target: 'new' | 'edit'): void {
    if (target === 'edit') setEditQuantity(normalizeQuantity(editQuantity));
    else setQuantity(normalizeQuantity(quantity));
    setQuantityPickerTarget(target);
  }

  async function saveEdit(): Promise<void> {
    if (!editingItem || !editName.trim()) {
      setError('Escribe un nombre para el producto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateShoppingItem({
        id: editingItem.id,
        name: editName,
        quantity: editQuantity,
        quantityUnit: editQuantityUnit,
        category: editCategory,
        imageUrl: editingItem.image_url,
      });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      cancelEditing();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo editar el producto.');
    } finally {
      setBusy(false);
    }
  }

  function changeProductName(value: string): void {
    setName(value);
    setSelectedImageUrl(null);
  }

  function applyCatalogSuggestion(suggestion: ProductCatalogEntry): void {
    setName(suggestion.display_name);
    if (householdCategories.some((option) => option.enabled && option.name === suggestion.category)) {
      setCategory(suggestion.category);
    }
    setSelectedImageUrl(null);
    setCatalogSuggestions([]);
  }

  function openCategoryManager(): void {
    setCategoryError(null);
    setCategoryManagerVisible(true);
  }

  async function toggleCategoryEnabled(option: HouseholdCategory): Promise<void> {
    const nextEnabled = !option.enabled;
    setHouseholdCategories((current) => current.map((categoryOption) =>
      categoryOption.id === option.id ? { ...categoryOption, enabled: nextEnabled } : categoryOption,
    ));
    if (!nextEnabled && category === option.name) {
      const nextCategory = householdCategories.find((categoryOption) => categoryOption.enabled && categoryOption.id !== option.id)?.name ?? '';
      setCategory(nextCategory);
    }
    try {
      await setHouseholdCategoryEnabled(household.id, option.id, nextEnabled);
    } catch (caught) {
      setHouseholdCategories((current) => current.map((categoryOption) =>
        categoryOption.id === option.id ? { ...categoryOption, enabled: option.enabled } : categoryOption,
      ));
      setCategoryError(caught instanceof Error ? caught.message : 'No se pudo actualizar la categoría.');
    }
  }

  async function toggleCategoryMode(): Promise<void> {
    const nextEnabled = !categoryModeEnabled;
    setCategoryModeEnabled(nextEnabled);
    if (!nextEnabled) setCategory('Sin categoría');
    else setCategory(householdCategories.find((option) => option.enabled)?.name ?? '');
    try {
      await setHouseholdCategoryMode(household.id, nextEnabled);
    } catch (caught) {
      setCategoryModeEnabled(!nextEnabled);
      setCategoryError(caught instanceof Error ? caught.message : 'No se pudo cambiar la vista de categorías.');
    }
  }

  function openCreateCategory(): void {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryEmoji('🏷️');
    setConfirmingCategoryDelete(false);
    setCategoryError(null);
    setCategoryManagerVisible(false);
    setCategoryModalVisible(true);
  }

  function openEditCategory(categoryValue: string): void {
    const storedCategory = householdCategories.find((option) => option.name === categoryValue);
    if (!storedCategory) {
      setError('Esta categoría pertenece a un producto antiguo. Crea una categoría con este nombre para gestionarla.');
      return;
    }
    setEditingCategory(storedCategory);
    setCategoryName(storedCategory.name);
    setCategoryEmoji(storedCategory.emoji || '🏷️');
    setConfirmingCategoryDelete(false);
    setCategoryManagerVisible(false);
    setCategoryError(null);
    setCategoryModalVisible(true);
  }

  async function saveCategory(): Promise<void> {
    if (!categoryName.trim()) {
      setCategoryError('Escribe el nombre de la categoría.');
      return;
    }
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      const saved = editingCategory
        ? await updateHouseholdCategory(editingCategory.id, categoryName, categoryEmoji)
        : await createHouseholdCategory(categoryName, categoryEmoji);
      setHouseholdCategories((current) => editingCategory
        ? current.map((option) => option.id === saved.id ? saved : option)
        : [...current, saved]);
      setCategory((current) => editingCategory?.name === current ? saved.name : current || saved.name);
      setEditCategory((current) => editingCategory?.name === current ? saved.name : current);
      setCategoryModalVisible(false);
    } catch (caught) {
      setCategoryError(caught instanceof Error ? caught.message : 'No se pudo guardar la categoría.');
    } finally {
      setCategoryBusy(false);
    }
  }

  async function removeCategory(): Promise<void> {
    if (!editingCategory) return;
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      await deleteHouseholdCategory(editingCategory.id);
      setHouseholdCategories((current) => current.filter((option) => option.id !== editingCategory.id));
      setItems((current) => current.map((item) => item.category === editingCategory.name
        ? { ...item, category: 'Sin categoría' }
        : item));
      setCategory((current) => current === editingCategory.name ? '' : current);
      setCategoryModalVisible(false);
    } catch (caught) {
      setCategoryError(caught instanceof Error ? caught.message : 'No se pudo borrar la categoría.');
    } finally {
      setCategoryBusy(false);
    }
  }

  async function takeProductPhoto(): Promise<void> {
    setImageUploadBusy(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos permiso de cámara para hacer una foto.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
      });
      await savePickedProductImage(result);
    } catch (caught) {
      setError(friendlyImageError(caught));
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function chooseProductPhoto(): Promise<void> {
    setImageUploadBusy(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos permiso para seleccionar una imagen.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
      });
      await savePickedProductImage(result);
    } catch (caught) {
      setError(friendlyImageError(caught));
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function savePickedProductImage(result: ImagePicker.ImagePickerResult): Promise<void> {
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setSelectedImageUrl(await uploadProductImage({
      householdId: household.id,
      uri: asset.uri,
      width: asset.width,
    }));
  }

  async function addItem(): Promise<void> {
    if (!name.trim()) return;
    if (!category) {
      setError('Crea y selecciona una categoría antes de añadir el producto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await addShoppingItem({
        householdId: household.id,
        name,
        quantity,
        quantityUnit,
        category,
        imageUrl: selectedImageUrl,
      });
      setItems((current) => [created, ...current]);
      setName('');
      setQuantity('1');
      setQuantityUnit('unidades');
      setSelectedImageUrl(null);
      try {
        await rememberProductCatalog({
          name,
          category,
        });
      } catch {
        // The catalog is an enhancement; an unapplied migration must not block purchases.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo añadir el producto.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item: ShoppingItem): Promise<void> {
    const completing = !item.is_completed;
    if (completing) setCelebrate((value) => value + 1);
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, is_completed: completing, image_url: completing ? null : candidate.image_url }
          : candidate,
      ),
    );
    try {
      await setItemCompleted(item.id, completing);
      if (completing && item.image_url) {
        await deleteProductImage(item.image_url);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el producto.');
      void refresh();
    }
  }

  async function removeItem(item: ShoppingItem): Promise<void> {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await deleteShoppingItem(item.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo borrar el producto.');
      void refresh();
    }
  }

  async function clearCompleted(): Promise<void> {
    if (!completedCount) return;
    setBusy(true);
    try {
      await clearCompletedItems(household.id);
      setItems((current) => current.filter((item) => !item.is_completed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron borrar los completados.');
    } finally {
      setBusy(false);
    }
  }

  async function completeMany(targetItems: ShoppingItem[]): Promise<void> {
    const pendingItems = targetItems.filter((item) => !item.is_completed);
    if (!pendingItems.length || busy) return;
    setBusy(true);
    setError(null);
    setCelebrate((value) => value + 1);
    setItems((current) => current.map((item) =>
      pendingItems.some((target) => target.id === item.id)
        ? { ...item, is_completed: true, image_url: null }
        : item,
    ));
    try {
      await Promise.all(pendingItems.map(async (item) => {
        await setItemCompleted(item.id, true);
        if (item.image_url) await deleteProductImage(item.image_url);
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron marcar todos los productos.');
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(category: string): void {
    setCollapsedCategories((current) => ({ ...current, [category]: !current[category] }));
  }

  function renderCategoryGroup({ item: group }: { item: CategoryGroup }) {
    const categoryOption = householdCategories.find((option) => option.name === group.category);
    const categoryEmoji = categoryOption?.emoji || '🏷️';
    const collapsed = Boolean(collapsedCategories[group.category]);
    return (
      <View style={styles.categorySection}>
        <View style={styles.categoryHeader}>
          <Pressable
            style={styles.categoryToggle}
            onPress={() => toggleCategory(group.category)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={`${collapsed ? 'Abrir' : 'Cerrar'} categoría ${group.category}`}
          >
            <View style={styles.categorySectionIcon}>
              <Text style={styles.categorySectionEmoji}>{categoryEmoji}</Text>
            </View>
            <View style={styles.categorySectionCopy}>
              <Text style={styles.categorySectionTitle}>{group.category}</Text>
              <Text style={styles.categorySectionMeta}>
                {group.pendingCount ? `${group.pendingCount} por comprar` : 'Todo comprado'} · {group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}
              </Text>
            </View>
          </Pressable>
          {group.pendingCount ? (
            <Pressable
              style={styles.categorySelectButton}
              onPress={() => void completeMany(group.items)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Marcar todos los productos de ${group.category}`}
            >
              <MaterialCommunityIcons name="check-all" size={16} color={COLORS.lime} />
              <Text style={styles.categorySelectText}>Todos</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.categoryExpandButton}
            onPress={() => toggleCategory(group.category)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={`${collapsed ? 'Abrir' : 'Cerrar'} categoría ${group.category}`}
          >
            <MaterialCommunityIcons
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={21}
              color={COLORS.muted}
            />
          </Pressable>
        </View>
        {!collapsed ? (
          <View style={styles.categoryItems}>
            {group.items.map((item) => (
              <View key={item.id}>{renderItem({ item })}</View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderItem({ item }: { item: ShoppingItem }) {
    return (
      <AnimatedRow>
        <View style={[styles.itemRow, item.is_completed && styles.itemCompleted]}>
          <FunCheckbox checked={item.is_completed} onPress={() => void toggleItem(item)} />
          {item.image_url ? (
            <Pressable
              style={styles.itemImageButton}
              onPress={() => setPreviewImageUrl(item.image_url)}
              accessibilityRole="button"
              accessibilityLabel={`Ampliar foto de ${item.name}`}
            >
              <Image source={{ uri: item.image_url }} style={styles.itemImage} />
              <View style={styles.itemImageZoomBadge}>
                <MaterialCommunityIcons name="magnify-plus-outline" size={12} color={COLORS.bg} />
              </View>
            </Pressable>
          ) : null}
          <Pressable style={styles.itemMain} onPress={() => void toggleItem(item)}>
            <View style={styles.itemTitleRow}>
              <Text
                numberOfLines={1}
                style={[styles.itemName, item.is_completed && styles.itemNameDone]}
              >
                {item.name}
              </Text>
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityBadgeText}>{formatQuantity(item.quantity, item.quantity_unit)}</Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            onPress={() => startEditing(item)}
            accessibilityLabel={`Editar ${item.name}`}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.cyan} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
            onPress={() => void removeItem(item)}
            accessibilityLabel={`Borrar ${item.name}`}
          >
            <MaterialCommunityIcons name="delete-outline" size={19} color={COLORS.mutedDeep} />
          </Pressable>
        </View>
      </AnimatedRow>
    );
  }

  const pickerQuantity = quantityPickerTarget === 'edit' ? editQuantity : quantity;
  const pickerUnit = quantityPickerTarget === 'edit' ? editQuantityUnit : quantityUnit;

  const headerStyle = {
    opacity: headerIn,
    transform: [
      {
        translateY: headerIn.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }),
      },
    ],
  };

  return (
    <FontScaleContext.Provider value={fontScale}>
    <KeyboardAvoidingView
      style={[styles.screen, compact && styles.screenCompact]}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <StatusBar style="light" />
      <AmbientGroceries />
      <ConfettiBurst trigger={celebrate} />

      <View style={[styles.content, compact && styles.contentCompact]}>
      <Animated.View style={[styles.header, compact && styles.headerCompact, headerStyle]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LISTA COMPARTIDA</Text>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
            {household.name} {pendingCount === 0 && items.length > 0 ? '🎉' : '🛒'}
          </Text>
          <View style={styles.countRow}>
            <MaterialCommunityIcons name="fire" size={13} color={COLORS.lime} />
            <Text style={styles.count}>
              {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
            </Text>
            {completedCount > 0 ? (
              <Text style={styles.countDone}>· {completedCount} en casa</Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
            onPress={() => setSettingsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir ajustes de accesibilidad"
          >
            <MaterialCommunityIcons name="cog-outline" size={19} color={COLORS.violet} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.backHouseButton, pressed && styles.pressed]}
            onPress={onChangeHouse}
            accessibilityLabel="Volver al menú de casas"
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.cyan} />
            <Text style={styles.backHouseText}>Casas</Text>
          </Pressable>
        </View>
      </Animated.View>

      {items.length > 0 ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressMotion.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      ) : null}

      <View style={styles.addCard}>
        <View style={[styles.addRow, compact && styles.addRowCompact]}>
          <TextInput
            style={[styles.itemInput, compact && styles.itemInputCompact]}
            value={name}
            onChangeText={changeProductName}
            onSubmitEditing={() => void addItem()}
            returnKeyType="done"
            placeholder="Añadir producto…"
            placeholderTextColor={COLORS.mutedDeep}
          />
          <Pressable
            style={({ pressed }) => [styles.quantityPickerButton, pressed && styles.pressed]}
            onPress={() => openQuantityPicker('new')}
            accessibilityRole="button"
            accessibilityLabel={`Cantidad: ${quantity}. Abrir selector`}
          >
            <Text style={styles.quantityValue}>{formatQuantity(quantity, quantityUnit)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={COLORS.muted} />
          </Pressable>
          <Pressable
              style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}
              onPress={() => void takeProductPhoto()}
              disabled={imageUploadBusy}
              accessibilityLabel="Hacer foto y recortar el producto"
            >
              {imageUploadBusy ? <ActivityIndicator color={COLORS.cyan} size="small" /> : <MaterialCommunityIcons name="camera-outline" size={21} color={COLORS.cyan} />}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}
              onPress={() => void chooseProductPhoto()}
              disabled={imageUploadBusy}
              accessibilityLabel="Elegir una imagen y recortarla"
            >
              <MaterialCommunityIcons name="image-outline" size={21} color={COLORS.cyan} />
            </Pressable>
            <Pressable
            style={({ pressed }) => [styles.addButton, !category && styles.addButtonDisabled, pressed && styles.addButtonPressed]}
            onPress={() => void addItem()}
            disabled={busy || !category}
            accessibilityLabel="Añadir producto"
          >
            {busy ? (
              <ActivityIndicator color={COLORS.bg} size="small" />
            ) : (
              <MaterialCommunityIcons name="plus" size={26} color={COLORS.bg} />
            )}
          </Pressable>
        </View>
        {catalogSuggestions.length ? (
          <View style={styles.catalogSuggestions}>
            <View style={styles.catalogSuggestionHeader}>
              <MaterialCommunityIcons name="history" size={15} color={COLORS.cyan} />
              <Text style={styles.catalogSuggestionLabel}>Productos usados anteriormente</Text>
            </View>
            {catalogSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                style={styles.catalogSuggestion}
                onPress={() => applyCatalogSuggestion(suggestion)}
                accessibilityRole="button"
                accessibilityLabel={`Autocompletar ${suggestion.display_name}`}
              >
                <View style={styles.catalogSuggestionIcon}>
                  <MaterialCommunityIcons name="cart-outline" size={17} color={COLORS.cyan} />
                </View>
                <View style={styles.catalogSuggestionCopy}>
                  <Text style={styles.catalogSuggestionName}>{suggestion.display_name}</Text>
                  <Text style={styles.catalogSuggestionMeta}>
                    {suggestion.category} · comprado {suggestion.purchase_count} {suggestion.purchase_count === 1 ? 'vez' : 'veces'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="arrow-up-left" size={17} color={COLORS.lime} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {catalogSearchBusy ? (
          <View style={styles.catalogSearchStatus}>
            <ActivityIndicator color={COLORS.cyan} size="small" />
            <Text style={styles.catalogSearchText}>Buscando productos guardados…</Text>
          </View>
        ) : null}
        {selectedImageUrl ? (
          <View style={styles.selectedImageRow}>
            <MaterialCommunityIcons name="image-check-outline" size={15} color={COLORS.lime} />
            <Text style={styles.selectedImageText}>Imagen seleccionada para este producto</Text>
            <Pressable onPress={() => setSelectedImageUrl(null)} hitSlop={8} accessibilityLabel="Quitar imagen">
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.muted} />
            </Pressable>
          </View>
        ) : null}
        {categoryModeEnabled && householdCategories.some((option) => option.enabled) ? (
          <View style={styles.categoryToolbar}>
            <Pressable
              style={styles.manageCategoriesButton}
              onPress={openCategoryManager}
              accessibilityRole="button"
              accessibilityLabel="Gestionar categorías de esta casa"
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={COLORS.lime} />
              <Text style={styles.manageCategoriesText}>Gestionar categorías</Text>
            </Pressable>
            <FlatList
              style={styles.categoryList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
              data={householdCategories.filter((option) => option.enabled)}
              keyExtractor={(option) => option.id}
              renderItem={({ item: option }) => {
                const active = category === option.name;
                const emoji = CATEGORY_META[option.name as ItemCategory]?.emoji ?? option.emoji;
                return (
                  <Pressable
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setCategory(option.name)}
                  >
                    <Text style={styles.categoryEmoji}>{emoji}</Text>
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                      {option.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : categoryModeEnabled ? (
          <View style={styles.categoryToolbar}>
            <Pressable
              style={styles.manageCategoriesButton}
              onPress={openCategoryManager}
              accessibilityRole="button"
              accessibilityLabel="Gestionar categorías de esta casa"
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={COLORS.lime} />
              <Text style={styles.manageCategoriesText}>Gestionar categorías</Text>
            </Pressable>
            <Text style={[styles.noCategoriesText, styles.noCategoriesInline]}>Crea una categoría para clasificar.</Text>
          </View>
        ) : (
          <Pressable
            style={styles.manageCategoriesButton}
            onPress={openCategoryManager}
            accessibilityRole="button"
            accessibilityLabel="Gestionar categorías de esta casa"
          >
            <MaterialCommunityIcons name="format-list-bulleted" size={16} color={COLORS.lime} />
            <Text style={styles.manageCategoriesText}>Gestionar categorías</Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={categoryManagerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryManagerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.categoryManagerModal}>
            <View style={styles.quantityModalHeader}>
              <View>
                <Text style={styles.quantityModalEyebrow}>ORGANIZAR CASA</Text>
                <Text style={styles.quantityModalTitle}>Categorías</Text>
              </View>
              <Pressable
                style={styles.closeModalButton}
                onPress={() => setCategoryManagerVisible(false)}
                accessibilityLabel="Cerrar gestor de categorías"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={styles.categoryManagerHint}>
              Las categorías son comunes a todas las casas. Aquí eliges cuáles quieres usar en esta vivienda.
            </Text>
            <View style={styles.categoryModeRow}>
              <View style={styles.categoryModeCopy}>
                <Text style={styles.categoryModeTitle}>Modo categorías</Text>
                <Text style={styles.categoryModeText}>Agrupa la lista por secciones y muestra sus emojis.</Text>
              </View>
              <Switch
                value={categoryModeEnabled}
                onValueChange={() => void toggleCategoryMode()}
                trackColor={{ false: COLORS.lineSoft, true: '#4d7f45' }}
                thumbColor={categoryModeEnabled ? COLORS.lime : COLORS.muted}
                accessibilityLabel="Activar o desactivar modo categorías"
              />
            </View>
            <ScrollView
              style={styles.categoryManagerList}
              contentContainerStyle={styles.categoryManagerListContent}
              showsVerticalScrollIndicator={false}
            >
              {householdCategories.length ? householdCategories.map((option) => (
                <View key={option.id} style={styles.categoryManagerRow}>
                  <Text style={styles.categoryManagerEmoji}>{option.emoji}</Text>
                  <Text style={styles.categoryManagerName} numberOfLines={1}>{option.name}</Text>
                  <Switch
                    value={option.enabled}
                    onValueChange={() => void toggleCategoryEnabled(option)}
                    trackColor={{ false: COLORS.lineSoft, true: '#4d7f45' }}
                    thumbColor={option.enabled ? COLORS.lime : COLORS.muted}
                    accessibilityLabel={`${option.enabled ? 'Desactivar' : 'Activar'} ${option.name}`}
                  />
                  <Pressable
                    style={styles.categoryManagerEditButton}
                    onPress={() => openEditCategory(option.name)}
                    accessibilityLabel={`Editar ${option.name}`}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={17} color={COLORS.cyan} />
                  </Pressable>
                </View>
              )) : (
                <Text style={styles.noCategoriesText}>Todavía no has creado ninguna categoría.</Text>
              )}
            </ScrollView>
            {categoryError ? <Text style={styles.categoryModalError}>{categoryError}</Text> : null}
            <Pressable
              style={styles.managerAddButton}
              onPress={openCreateCategory}
              accessibilityRole="button"
              accessibilityLabel="Añadir categoría"
            >
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.bg} />
              <Text style={styles.managerAddText}>Añadir categoría</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'android' ? 'height' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.categoryModal}>
            <View style={styles.quantityModalHeader}>
              <View>
                <Text style={styles.quantityModalEyebrow}>CATEGORÍAS DE LA CASA</Text>
                <Text style={styles.quantityModalTitle}>{editingCategory ? 'Cambiar categoría' : 'Nueva categoría'}</Text>
              </View>
              <Pressable
                style={styles.closeModalButton}
                onPress={() => setCategoryModalVisible(false)}
                accessibilityLabel="Cerrar categorías"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            {confirmingCategoryDelete && editingCategory ? (
              <View style={styles.categoryDeleteConfirm}>
                <MaterialCommunityIcons name="alert-outline" size={27} color={COLORS.danger} />
                <Text style={styles.categoryDeleteTitle}>¿Borrar “{editingCategory.name}”?</Text>
                <Text style={styles.categoryDeleteText}>
                  Los productos que la usan pasarán a “Sin categoría”. Esta acción no se puede deshacer.
                </Text>
                {categoryError ? <Text style={styles.categoryModalError}>{categoryError}</Text> : null}
                <View style={styles.categoryModalActions}>
                  <Pressable
                    style={styles.cancelEditButton}
                    onPress={() => setConfirmingCategoryDelete(false)}
                    disabled={categoryBusy}
                  >
                    <Text style={styles.cancelEditText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteCategoryButton}
                    onPress={() => void removeCategory()}
                    disabled={categoryBusy}
                  >
                    {categoryBusy ? <ActivityIndicator color={COLORS.text} size="small" /> : <>
                      <Text style={styles.deleteCategoryText}>Borrar</Text>
                      <MaterialCommunityIcons name="trash-can-outline" size={17} color={COLORS.text} />
                    </>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.categoryModalHint}>
                  Escribe tú mismo el nombre y elige un emoji. Después podrás volver aquí para cambiar cualquiera de las dos cosas.
                </Text>
                <Text style={styles.editLabel}>EMOJI</Text>
                <View style={styles.emojiPicker}>
                  {CATEGORY_EMOJI_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      style={[styles.emojiOption, categoryEmoji === option && styles.emojiOptionActive]}
                      onPress={() => setCategoryEmoji(option)}
                      accessibilityRole="button"
                      accessibilityLabel={`Usar emoji ${option}`}
                    >
                      <Text style={styles.emojiOptionText}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.emojiInput}
                  value={categoryEmoji}
                  onChangeText={setCategoryEmoji}
                  maxLength={4}
                  placeholder="O escribe otro emoji"
                  placeholderTextColor={COLORS.mutedDeep}
                  accessibilityLabel="Emoji de la categoría"
                />
                <Text style={styles.editLabel}>NOMBRE</Text>
                <TextInput
                  style={styles.editInput}
                  value={categoryName}
                  onChangeText={setCategoryName}
                  autoFocus
                  placeholder="Ej. Desayunos"
                  placeholderTextColor={COLORS.mutedDeep}
                  returnKeyType="done"
                  onSubmitEditing={() => void saveCategory()}
                />
                {categoryError ? <Text style={styles.categoryModalError}>{categoryError}</Text> : null}
                <View style={styles.categoryModalActions}>
                  <Pressable
                    style={styles.cancelEditButton}
                    onPress={() => setCategoryModalVisible(false)}
                    disabled={categoryBusy}
                  >
                    <Text style={styles.cancelEditText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.saveEditButton}
                    onPress={() => void saveCategory()}
                    disabled={categoryBusy}
                  >
                    {categoryBusy ? <ActivityIndicator color={COLORS.bg} size="small" /> : <>
                      <Text style={styles.confirmQuantityText}>Guardar</Text>
                      <MaterialCommunityIcons name="check" size={18} color={COLORS.bg} />
                    </>}
                  </Pressable>
                </View>
                {editingCategory ? (
                  <Pressable
                    style={styles.deleteCategoryOutlineButton}
                    onPress={() => setConfirmingCategoryDelete(true)}
                    disabled={categoryBusy}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color={COLORS.danger} />
                    <Text style={styles.deleteCategoryOutlineText}>Borrar categoría</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editingItem !== null && quantityPickerTarget !== 'edit'}
        transparent
        animationType="fade"
        onRequestClose={cancelEditing}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'android' ? 'height' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.editModal}>
            <View style={styles.quantityModalHeader}>
              <View>
                <Text style={styles.quantityModalEyebrow}>EDITAR PRODUCTO</Text>
                <Text style={styles.quantityModalTitle}>Corrige tu alimento</Text>
              </View>
              <Pressable
                style={styles.closeModalButton}
                onPress={cancelEditing}
                accessibilityLabel="Cerrar edición"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={styles.editLabel}>NOMBRE</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              placeholder="Nombre del alimento"
              placeholderTextColor={COLORS.mutedDeep}
            />
            <View style={styles.editControlsRow}>
              <View style={styles.editControl}>
                <Text style={styles.editLabel}>CANTIDAD</Text>
                <Pressable
                  style={styles.editQuantityButton}
                  onPress={() => openQuantityPicker('edit')}
                >
                  <Text style={styles.editQuantityText}>{formatQuantity(editQuantity, editQuantityUnit)}</Text>
                  <MaterialCommunityIcons name="unfold-more-horizontal" size={17} color={COLORS.muted} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.editLabel}>CATEGORÍA</Text>
            <FlatList
              horizontal
              data={householdCategories}
              keyExtractor={(option) => option.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.editCategories}
              renderItem={({ item: option }) => {
                const active = editCategory === option.name;
                const emoji = CATEGORY_META[option.name as ItemCategory]?.emoji ?? option.emoji;
                return (
                  <Pressable
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setEditCategory(option.name)}
                  >
                    <Text style={styles.categoryEmoji}>{emoji}</Text>
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                      {option.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {error && editingItem ? <Text style={styles.editError}>{error}</Text> : null}
            <View style={styles.editActions}>
              <Pressable style={styles.cancelEditButton} onPress={cancelEditing} disabled={busy}>
                <Text style={styles.cancelEditText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.saveEditButton, pressed && styles.pressed]}
                onPress={() => void saveEdit()}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={COLORS.bg} size="small" /> : <>
                  <Text style={styles.confirmQuantityText}>Guardar</Text>
                  <MaterialCommunityIcons name="check" size={18} color={COLORS.bg} />
                </>}
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={quantityPickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setQuantityPickerTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.quantityModal}>
            <View style={styles.quantityModalHeader}>
              <View>
                <Text style={styles.quantityModalEyebrow}>CANTIDAD</Text>
                <Text style={styles.quantityModalTitle}>Cantidad y unidad</Text>
              </View>
              <Pressable
                style={styles.closeModalButton}
                onPress={() => setQuantityPickerTarget(null)}
                accessibilityLabel="Cerrar selector de cantidad"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <View style={styles.wheelFrame}>
              <FlatList
                style={styles.wheelList}
                contentContainerStyle={styles.wheelContent}
                data={QUANTITY_OPTIONS}
                keyExtractor={(value) => value}
                ref={quantityListRef}
                getItemLayout={(_, index) => ({
                  length: QUANTITY_ITEM_HEIGHT,
                  offset: QUANTITY_ITEM_HEIGHT * index,
                  index,
                })}
                snapToInterval={QUANTITY_ITEM_HEIGHT}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onScrollEndDrag={({ nativeEvent }) => {
                  const index = Math.min(
                    QUANTITY_OPTIONS.length - 1,
                    Math.max(0, Math.round(nativeEvent.contentOffset.y / QUANTITY_ITEM_HEIGHT)),
                  );
                  setPickerQuantity(QUANTITY_OPTIONS[index], false);
                }}
                onMomentumScrollEnd={({ nativeEvent }) => {
                  const index = Math.min(
                    QUANTITY_OPTIONS.length - 1,
                    Math.max(0, Math.round(nativeEvent.contentOffset.y / QUANTITY_ITEM_HEIGHT)),
                  );
                  setPickerQuantity(QUANTITY_OPTIONS[index], false);
                }}
                renderItem={({ item: option }) => (
                  <Pressable
                    style={styles.wheelItem}
                    onPress={() => setPickerQuantity(option)}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar cantidad ${option}`}
                  >
                    <Text style={[styles.wheelText, option === pickerQuantity && styles.wheelTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                )}
              />
              <View pointerEvents="none" style={styles.wheelSelection} />
            </View>
            <Text style={styles.quantityUnitLabel}>CANTIDAD · MÁXIMO {MAX_QUANTITY}</Text>
            <TextInput
              style={styles.quantityNumberInput}
              value={pickerQuantity}
              onChangeText={handlePickerQuantityInput}
              keyboardType="number-pad"
              maxLength={String(MAX_QUANTITY).length}
              placeholder="Escribe o desliza"
              placeholderTextColor={COLORS.mutedDeep}
              accessibilityLabel={`Cantidad, máximo ${MAX_QUANTITY}`}
            />
            <Text style={styles.quantityPickerHint}>También puedes deslizar para elegir un número.</Text>
            <Text style={styles.quantityUnitLabel}>UNIDAD</Text>
            <View style={styles.quantityUnitsGrid}>
              {QUANTITY_UNIT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.quantityUnitChip, pickerUnit === option.value && styles.quantityUnitChipActive]}
                  onPress={() => {
                    if (quantityPickerTarget === 'edit') setEditQuantityUnit(option.value);
                    else setQuantityUnit(option.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar unidad ${option.label}`}
                >
                  <Text style={[styles.quantityUnitText, pickerUnit === option.value && styles.quantityUnitTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.quantityUnitInput}
              value={pickerUnit === 'unidades' || QUANTITY_UNIT_OPTIONS.some((option) => option.value === pickerUnit) ? '' : pickerUnit}
              onChangeText={(value) => {
                if (quantityPickerTarget === 'edit') setEditQuantityUnit(value);
                else setQuantityUnit(value);
              }}
              placeholder="Otra unidad (ej. porciones)"
              placeholderTextColor={COLORS.mutedDeep}
              returnKeyType="done"
              maxLength={18}
              accessibilityLabel="Escribir otra unidad"
            />
            <Pressable
              style={({ pressed }) => [styles.confirmQuantityButton, pressed && styles.pressed]}
              onPress={() => setQuantityPickerTarget(null)}
            >
              <Text style={styles.confirmQuantityText}>
                Usar {formatQuantity(pickerQuantity, pickerUnit)}
              </Text>
              <MaterialCommunityIcons name="check" size={19} color={COLORS.bg} />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <View style={styles.quantityModalHeader}>
              <View>
                <Text style={styles.quantityModalEyebrow}>ACCESIBILIDAD</Text>
                <Text style={styles.quantityModalTitle}>Ajustes de lectura</Text>
              </View>
              <Pressable
                style={styles.closeModalButton}
                onPress={() => setSettingsVisible(false)}
                accessibilityLabel="Cerrar ajustes"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={styles.settingsHint}>
              Aumenta el tamaño de la letra para leer la lista con más comodidad. Se guardará en este dispositivo.
            </Text>
            <Text style={styles.quantityUnitLabel}>TAMAÑO DE LETRA</Text>
            <View style={styles.fontScaleOptions}>
              {FONT_SCALE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.fontScaleOption, fontScale === option.value && styles.fontScaleOptionActive]}
                  onPress={() => void updateFontScale(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Tamaño de letra ${option.label}`}
                >
                  <Text style={[styles.fontScaleSample, { fontSize: 18 * option.value }]}>{option.sample}</Text>
                  <Text style={[styles.fontScaleLabel, fontScale === option.value && styles.fontScaleLabelActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.confirmQuantityButton, pressed && styles.pressed]}
              onPress={() => setSettingsVisible(false)}
            >
              <Text style={styles.confirmQuantityText}>Guardar ajustes</Text>
              <MaterialCommunityIcons name="check" size={19} color={COLORS.bg} />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewImageUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.imagePreviewBackdrop}>
          <View style={styles.imagePreviewPanel}>
            <View style={styles.imagePreviewHeader}>
              <Text style={styles.imagePreviewTitle}>Foto del producto</Text>
              <Pressable
                style={styles.closeModalButton}
                onPress={() => setPreviewImageUrl(null)}
                accessibilityLabel="Cerrar foto ampliada"
              >
                <MaterialCommunityIcons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            {previewImageUrl ? (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.imagePreviewImage}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.imagePreviewHint}>Pulsa la X para cerrar</Text>
          </View>
        </View>
      </Modal>

      {pendingCount ? (
        <Pressable
          style={({ pressed }) => [styles.selectAllButton, pressed && styles.pressed]}
          onPress={() => void completeMany(items)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Marcar todos los productos pendientes"
        >
          {busy ? <ActivityIndicator color={COLORS.bg} size="small" /> : <MaterialCommunityIcons name="check-all" size={19} color={COLORS.bg} />}
          <Text style={styles.selectAllText}>Marcar todos ({pendingCount})</Text>
        </Pressable>
      ) : null}
      <View style={styles.listToolbar}>
        <Pressable
          onPress={() => setShowCompleted((value) => !value)}
          style={styles.filterButton}
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={showCompleted ? 'eye-off-outline' : 'format-list-bulleted'}
            size={15}
            color={COLORS.muted}
          />
          <Text style={styles.filterText}>
            {showCompleted
              ? 'Ocultar completados'
              : `Ver completados${completedCount ? ` · ${completedCount}` : ''}`}
          </Text>
        </Pressable>
        {completedCount ? (
          <Pressable onPress={() => void clearCompleted()} style={styles.filterButton} hitSlop={8}>
            <MaterialCommunityIcons name="basket-outline" size={15} color={COLORS.danger} />
            <Text style={styles.clearText}>Limpiar</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={15} color={COLORS.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={COLORS.lime} style={styles.loader} /> : null}
      {!loading && !visibleItems.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{search ? '🔍' : '🧺'}</Text>
          <Text style={styles.emptyTitle}>
            {search ? 'No hay coincidencias' : items.length ? '¡Todo en casa! 🎉' : 'Tu lista está despejada'}
          </Text>
          <Text style={styles.emptyText}>
            {search
              ? 'Prueba con otro nombre.'
              : items.length
                ? 'Has completado toda la lista. ¡Buen trabajo!'
                : 'Añade el primer producto para empezar.'}
          </Text>
        </View>
      ) : (
        categoryModeEnabled ? (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={groupedItems}
            keyExtractor={(group) => group.category}
            renderItem={renderCategoryGroup}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={visibleItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )
      )}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.mutedDeep} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar en la lista"
          placeholderTextColor={COLORS.mutedDeep}
        />
      </View>
      </View>
    </KeyboardAvoidingView>
    </FontScaleContext.Provider>
  );
}

/** Pequeños elementos flotantes para que la pantalla respire y se sienta más viva. */
function AmbientGroceries() {
  const first = useRef(new Animated.Value(0)).current;
  const second = useRef(new Animated.Value(0)).current;
  const third = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration, useNativeDriver: true }),
        ]),
      );
    const loops = [makeLoop(first, 2600), makeLoop(second, 3200), makeLoop(third, 2900)];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [first, second, third]);

  return (
    <View pointerEvents="none" style={styles.ambientLayer}>
      <Animated.View style={[styles.ambientItem, styles.ambientOne, { transform: [{ translateY: first.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }, { rotate: '-12deg' }] }]}>
        <Text style={styles.ambientEmoji}>🥕</Text>
      </Animated.View>
      <Animated.View style={[styles.ambientItem, styles.ambientTwo, { transform: [{ translateY: second.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }, { rotate: '14deg' }] }]}>
        <Text style={styles.ambientEmoji}>🧃</Text>
      </Animated.View>
      <Animated.View style={[styles.ambientItem, styles.ambientThree, { transform: [{ translateY: third.interpolate({ inputRange: [0, 1], outputRange: [0, -13] }) }, { rotate: '-8deg' }] }]}>
        <Text style={styles.ambientEmoji}>🍎</Text>
      </Animated.View>
    </View>
  );
}

/** Entrada de fila con animación de aparición. */
function AnimatedRow({ children }: { children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Checkbox con resorte al completar. */
function FunCheckbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (checked) {
      scale.setValue(0.3);
      Animated.spring(scale, {
        toValue: 1,
        friction: 3,
        tension: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [checked, scale]);

  return (
    <Pressable
      style={[styles.checkbox, checked && styles.checkboxDone]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      {checked ? (
        <Animated.View style={{ transform: [{ scale }] }}>
          <MaterialCommunityIcons name="check" size={15} color={COLORS.bg} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** Explosión de confeti al completar un producto. */
function friendlyImageError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('row-level security') || normalized.includes('rls') || normalized.includes('new row violates')) {
    return 'Supabase está bloqueando la imagen. Ejecuta el contenido completo de supabase/database.sql y vuelve a intentarlo.';
  }
  return message || 'No se pudo guardar la imagen del producto.';
}

function ConfettiBurst({ trigger }: { trigger: number }) {
  const [running, setRunning] = useState(false);
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      value: new Animated.Value(0),
      angle: (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.5,
      distance: 90 + Math.random() * 140,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      emoji: i % 4 === 0 ? CONFETTI_EMOJI[(i / 4) % CONFETTI_EMOJI.length] : null,
      size: 6 + Math.random() * 7,
      rotate: Math.floor(Math.random() * 360),
    })),
  ).current;

  useEffect(() => {
    if (trigger === 0) return;
    particles.forEach((particle) => particle.value.setValue(0));
    setRunning(true);
    const animation = Animated.parallel(
      particles.map((particle, index) =>
        Animated.timing(particle.value, {
          toValue: 1,
          duration: 750 + Math.random() * 350,
          delay: index * 10,
          useNativeDriver: true,
        }),
      ),
    );
    animation.start(({ finished }) => {
      if (finished) {
        particles.forEach((particle) => particle.value.setValue(0));
        setRunning(false);
      }
    });
  }, [trigger, particles]);

  if (!running) return null;

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.confettiParticle,
            {
              width: particle.emoji ? 22 : particle.size,
              height: particle.emoji ? 22 : particle.size,
              backgroundColor: particle.emoji ? 'transparent' : particle.color,
              borderRadius: particle.emoji ? 0 : particle.size / 2,
              opacity: particle.value.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                {
                  translateX: particle.value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(particle.angle) * particle.distance],
                  }),
                },
                {
                  translateY: particle.value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(particle.angle) * particle.distance - 40],
                  }),
                },
                {
                  scale: particle.value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
                },
                {
                  rotate: particle.value.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${particle.rotate}deg`],
                  }),
                },
              ],
            },
          ]}
        >
          {particle.emoji ? <Text style={styles.confettiEmoji}>{particle.emoji}</Text> : null}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', backgroundColor: COLORS.bg, paddingHorizontal: 16 },
  screenCompact: { paddingHorizontal: 12 },
  ambientLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  ambientItem: { position: 'absolute', opacity: 0.14 },
  ambientEmoji: { fontSize: 30 },
  ambientOne: { top: 138, right: 10 },
  ambientTwo: { top: 330, left: 7 },
  ambientThree: { bottom: 125, right: 20 },
  content: { flex: 1, width: '100%', maxWidth: 760, zIndex: 1, backgroundColor: COLORS.bg },
  contentCompact: { maxWidth: 420 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerCompact: { flexDirection: 'column', alignItems: 'stretch' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: COLORS.lime, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 5, color: COLORS.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, flexShrink: 1 },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  count: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  countDone: { color: COLORS.mutedDeep, fontSize: 13 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerActionsCompact: { alignSelf: 'flex-end', marginTop: 9 },
  settingsButton: { alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line },
  backHouseButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 42, paddingHorizontal: 10, borderRadius: 14, backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line },
  backHouseText: { color: COLORS.cyan, fontSize: 12, fontWeight: '800' },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  pressed: { opacity: 0.75 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  progressTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.line,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.lime },
  progressText: { color: COLORS.lime, fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },
  addCard: { marginTop: 16, padding: 12, borderRadius: 18, backgroundColor: COLORS.panel },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  catalogSuggestions: { marginTop: 10, padding: 9, borderRadius: 14, backgroundColor: COLORS.panelDeep, borderWidth: 1, borderColor: COLORS.line },
  catalogSuggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 3, paddingBottom: 5 },
  catalogSuggestionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  catalogSuggestion: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 49, paddingVertical: 5, borderTopWidth: 1, borderTopColor: COLORS.line },
  catalogSuggestionIcon: { alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, backgroundColor: '#143331', overflow: 'hidden' },
  catalogSuggestionCopy: { flex: 1, minWidth: 0 },
  catalogSuggestionName: { color: COLORS.textSoft, fontSize: 13, fontWeight: '800' },
  catalogSuggestionMeta: { marginTop: 2, color: COLORS.mutedDeep, fontSize: 10 },
  addRowCompact: { flexWrap: 'wrap' },
  itemInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 13,
    color: COLORS.text,
    fontSize: 15,
    minWidth: 0,
  },
  itemInputCompact: { flexBasis: '100%', width: '100%' },
  quantityPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 68,
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 13,
    backgroundColor: COLORS.panelDeep,
  },
  quantityValue: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  cameraButton: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 13, backgroundColor: COLORS.panelDeep },
  galleryButton: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 13, backgroundColor: COLORS.panelDeep },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.lime,
  },
  addButtonPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  addButtonDisabled: { backgroundColor: COLORS.lineSoft },
  catalogSearchStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10, paddingHorizontal: 2 },
  catalogSearchText: { color: COLORS.muted, fontSize: 11 },
  selectedImageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9, paddingHorizontal: 2 },
  selectedImageText: { flex: 1, color: COLORS.limeDeep, fontSize: 11, fontWeight: '700' },
  categoryInfoCard: { marginTop: 11, padding: 10, borderRadius: 13, backgroundColor: '#12302d', borderWidth: 1, borderColor: COLORS.line },
  categoryInfoCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  categoryInfoText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  categoryToolbar: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0, marginTop: 9 },
  categoryList: { flex: 1, minWidth: 0 },
  manageCategoriesButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 5, height: 32, paddingHorizontal: 7, borderRadius: 9, backgroundColor: COLORS.panelDeep },
  manageCategoriesText: { color: COLORS.lime, fontSize: 11, fontWeight: '800' },
  noCategoriesText: { paddingTop: 10, color: COLORS.mutedDeep, fontSize: 11, lineHeight: 16 },
  noCategoriesInline: { flex: 1, paddingTop: 0 },
  categoryRow: { alignItems: 'center', gap: 7, paddingVertical: 0 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: COLORS.panelDeep,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  categoryChipActive: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  categoryEmoji: { fontSize: 14 },
  categoryText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  categoryTextActive: { color: COLORS.bg },
  selectAllButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, marginTop: 12, borderRadius: 14, backgroundColor: COLORS.lime },
  selectAllText: { color: COLORS.bg, fontSize: 13, fontWeight: '900' },
  listToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 7,
  },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 2 },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  clearText: { color: COLORS.danger, fontSize: 12, fontWeight: '800' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginVertical: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#5a2b26',
    borderRadius: 12,
    backgroundColor: '#2a1613',
  },
  error: { flex: 1, color: COLORS.danger, fontSize: 12, lineHeight: 17 },
  loader: { marginTop: 28 },
  list: { flex: 1, backgroundColor: COLORS.bg },
  listContent: { paddingBottom: 18, backgroundColor: COLORS.bg },
  categorySection: { marginBottom: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, backgroundColor: COLORS.panel, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 67, padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  categoryItems: { backgroundColor: COLORS.panelDeep },
  categoryToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0, paddingVertical: 3 },
  categorySectionIcon: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, backgroundColor: '#143331' },
  categorySectionEmoji: { fontSize: 19 },
  categorySectionCopy: { flex: 1, minWidth: 0 },
  categorySectionTitle: { color: COLORS.textSoft, fontSize: 14, fontWeight: '900' },
  categorySectionMeta: { marginTop: 3, color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  categorySelectButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 10, backgroundColor: COLORS.panelDeep },
  categoryExpandButton: { alignItems: 'center', justifyContent: 'center', width: 32, height: 34, marginLeft: 3, borderRadius: 10, backgroundColor: COLORS.panelDeep },
  categorySelectText: { color: COLORS.lime, fontSize: 10, fontWeight: '900' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  itemCompleted: { opacity: 0.55 },
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    marginRight: 11,
    borderWidth: 1.5,
    borderColor: '#4a6f5a',
    borderRadius: 9,
  },
  checkboxDone: { borderColor: COLORS.lime, backgroundColor: COLORS.lime },
  itemMain: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  itemImageButton: { position: 'relative', width: 44, height: 44, marginRight: 10, borderRadius: 12 },
  itemImage: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#f4f6f1' },
  itemImageZoomBadge: { position: 'absolute', right: -3, bottom: -3, alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.lime },
  itemName: { flexShrink: 1, color: COLORS.textSoft, fontSize: 15, fontWeight: '800' },
  itemNameDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  quantityBadge: { minWidth: 27, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: '#173a32' },
  quantityBadgeText: { color: COLORS.limeDeep, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  editButton: { padding: 7 },
  deleteButton: { padding: 7 },
  deletePressed: { opacity: 0.5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { marginTop: 10, color: COLORS.textSoft, fontSize: 17, fontWeight: '800' },
  emptyText: { marginTop: 5, color: COLORS.mutedDeep, fontSize: 13 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    marginBottom: Platform.OS === 'ios' ? 8 : 12,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 14,
    backgroundColor: COLORS.panelDeep,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  imagePreviewBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.86)' },
  imagePreviewPanel: { width: '100%', maxWidth: 720, padding: 14, borderRadius: 22, backgroundColor: COLORS.panel },
  imagePreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  imagePreviewTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  imagePreviewImage: { width: '100%', height: 430, marginTop: 10, borderRadius: 14, backgroundColor: '#f4f6f1' },
  imagePreviewHint: { marginTop: 9, color: COLORS.muted, textAlign: 'center', fontSize: 11 },
  modalScroll: { width: '100%' },
  modalScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  settingsModal: { width: '100%', maxWidth: 390, padding: 18, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 24, backgroundColor: COLORS.panel },
  settingsHint: { marginTop: 14, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  fontScaleOptions: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  fontScaleOption: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 83, paddingHorizontal: 5, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, backgroundColor: COLORS.panelDeep },
  fontScaleOptionActive: { borderColor: COLORS.lime, backgroundColor: '#183323' },
  fontScaleSample: { color: COLORS.text, fontWeight: '900' },
  fontScaleLabel: { marginTop: 6, color: COLORS.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  fontScaleLabelActive: { color: COLORS.lime },
  quantityModal: {
    width: '100%',
    maxWidth: 390,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 24,
    backgroundColor: COLORS.panel,
  },
  editModal: { width: '100%', maxWidth: 480, padding: 18, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 24, backgroundColor: COLORS.panel },
  categoryManagerModal: { width: '100%', maxWidth: 440, maxHeight: '82%', padding: 18, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 24, backgroundColor: COLORS.panel },
  categoryManagerHint: { marginTop: 14, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  categoryModeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13, padding: 10, borderRadius: 13, backgroundColor: '#12302d' },
  categoryModeCopy: { flex: 1 },
  categoryModeTitle: { color: COLORS.textSoft, fontSize: 13, fontWeight: '800' },
  categoryModeText: { marginTop: 3, color: COLORS.muted, fontSize: 10, lineHeight: 15 },
  categoryManagerList: { marginTop: 13 },
  categoryManagerListContent: { gap: 7, paddingBottom: 3 },
  categoryManagerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 51, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, backgroundColor: COLORS.panelDeep },
  categoryManagerEmoji: { width: 32, fontSize: 21, textAlign: 'center' },
  categoryManagerName: { flex: 1, marginLeft: 9, color: COLORS.textSoft, fontSize: 14, fontWeight: '800' },
  categoryManagerEditButton: { alignItems: 'center', justifyContent: 'center', width: 35, height: 35, borderRadius: 11, backgroundColor: '#143331' },
  managerAddButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 49, marginTop: 14, borderRadius: 14, backgroundColor: COLORS.lime },
  managerAddText: { color: COLORS.bg, fontSize: 14, fontWeight: '900' },
  categoryModal: { width: '100%', maxWidth: 440, padding: 18, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 24, backgroundColor: COLORS.panel },
  categoryModalHint: { marginTop: 16, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  emojiPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  emojiOption: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, backgroundColor: COLORS.panelDeep },
  emojiOptionActive: { borderColor: COLORS.lime, backgroundColor: '#183323' },
  emojiOptionText: { fontSize: 21 },
  emojiInput: { height: 42, marginTop: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 12, backgroundColor: COLORS.panelDeep, color: COLORS.text, fontSize: 18 },
  categoryModalError: { marginTop: 11, color: COLORS.danger, fontSize: 12, lineHeight: 18 },
  categoryModalActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 20 },
  deleteCategoryOutlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, marginTop: 14, borderWidth: 1, borderColor: '#5a2b26', borderRadius: 13 },
  deleteCategoryOutlineText: { color: COLORS.danger, fontSize: 13, fontWeight: '800' },
  categoryDeleteConfirm: { alignItems: 'flex-start', marginTop: 20 },
  categoryDeleteTitle: { marginTop: 13, color: COLORS.text, fontSize: 19, fontWeight: '800' },
  categoryDeleteText: { marginTop: 7, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  deleteCategoryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 50, borderRadius: 14, backgroundColor: COLORS.danger },
  deleteCategoryText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  editLabel: { color: COLORS.mutedDeep, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 17, marginBottom: 8 },
  editInput: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 14, backgroundColor: COLORS.panelDeep, color: COLORS.text, fontSize: 16 },
  editControlsRow: { flexDirection: 'row' },
  editControl: { flex: 1 },
  editQuantityButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 14, backgroundColor: COLORS.panelDeep },
  editQuantityText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  editCategories: { gap: 7, paddingBottom: 2 },
  editError: { marginTop: 12, color: COLORS.danger, fontSize: 13, lineHeight: 18 },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 22 },
  cancelEditButton: { alignItems: 'center', justifyContent: 'center', height: 50, paddingHorizontal: 18, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 14 },
  cancelEditText: { color: COLORS.muted, fontSize: 14, fontWeight: '800' },
  saveEditButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 50, borderRadius: 14, backgroundColor: COLORS.lime },
  quantityModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quantityModalEyebrow: { color: COLORS.lime, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  quantityModalTitle: { marginTop: 5, color: COLORS.text, fontSize: 21, fontWeight: '800' },
  closeModalButton: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.panelDeep },
  wheelFrame: { height: 240, marginTop: 18, overflow: 'hidden', borderRadius: 16, backgroundColor: COLORS.panelDeep },
  wheelList: { flex: 1 },
  wheelContent: { paddingVertical: 96 },
  wheelItem: { alignItems: 'center', justifyContent: 'center', height: QUANTITY_ITEM_HEIGHT },
  wheelText: { color: COLORS.mutedDeep, fontSize: 22, fontWeight: '700' },
  wheelTextActive: { color: COLORS.lime, fontSize: 29, fontWeight: '900' },
  wheelSelection: { position: 'absolute', top: 96, left: 12, right: 12, height: QUANTITY_ITEM_HEIGHT, borderWidth: 1, borderColor: COLORS.lime, borderRadius: 12, backgroundColor: 'rgba(167,243,106,0.08)' },
  quantityUnitLabel: { marginTop: 16, color: COLORS.mutedDeep, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  quantityNumberInput: { height: 48, marginTop: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.lime, borderRadius: 13, backgroundColor: COLORS.panelDeep, color: COLORS.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  quantityPickerHint: { marginTop: 6, color: COLORS.mutedDeep, fontSize: 11, textAlign: 'center' },
  quantityUnitsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 9 },
  quantityUnitChip: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: COLORS.panelDeep },
  quantityUnitChipActive: { borderColor: COLORS.lime, backgroundColor: '#183323' },
  quantityUnitText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  quantityUnitTextActive: { color: COLORS.lime },
  quantityUnitInput: { height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 12, backgroundColor: COLORS.panelDeep, color: COLORS.text, fontSize: 13 },
  confirmQuantityButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, marginTop: 16, borderRadius: 15, backgroundColor: COLORS.lime },
  confirmQuantityText: { color: COLORS.bg, fontSize: 15, fontWeight: '800' },
  confettiLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  confettiParticle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  confettiEmoji: { fontSize: 20 },
});
