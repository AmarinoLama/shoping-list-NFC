import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  addShoppingItem,
  clearCompletedItems,
  deleteShoppingItem,
  getHouseholdProduct,
  getShoppingItems,
  rememberPurchasedProduct,
  setItemCompleted,
  subscribeToShoppingItems,
  updateShoppingItem,
} from '../lib/shopping';
import { searchProductImages, uploadProductImage, type ProductImageCandidate } from '../lib/product-images';
import { CATEGORY_META, COLORS } from '../lib/ui';
import type { Household, ItemCategory, ShoppingItem } from '../types';
import { ITEM_CATEGORIES } from '../types';

type Props = {
  household: Household;
  onChangeHouse: () => void;
};

const CONFETTI_COLORS = [COLORS.lime, COLORS.cyan, COLORS.amber, COLORS.pink, COLORS.violet];
const CONFETTI_EMOJI = ['⭐', '🛒', '🎉', '🧃'];
const QUANTITY_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));
const QUANTITY_ITEM_HEIGHT = 48;

export function ListScreen({ household, onChangeHouse }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ItemCategory>('Despensa');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editCategory, setEditCategory] = useState<ItemCategory>('Despensa');
  const [quantityPickerTarget, setQuantityPickerTarget] = useState<'new' | 'edit' | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageCandidates, setImageCandidates] = useState<ProductImageCandidate[]>([]);
  const [imageSearchBusy, setImageSearchBusy] = useState(false);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const imageSearchRequest = useRef(0);

  const headerIn = useRef(new Animated.Value(0)).current;
  const progressMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerIn, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [headerIn]);

  async function refresh(): Promise<void> {
    try {
      setItems(await getShoppingItems(household.id));
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

  useEffect(() => {
    const requestId = ++imageSearchRequest.current;
    const query = name.trim();
    if (query.length < 3) {
      setImageCandidates([]);
      setImageSearchBusy(false);
      return;
    }
    const timeout = setTimeout(() => {
      setImageSearchBusy(true);
      void getHouseholdProduct(household.id, query)
        .catch(() => null)
        .then((savedProduct) => {
          if (imageSearchRequest.current !== requestId) return null;
          if (savedProduct?.image_url) {
            setSelectedImageUrl(savedProduct.image_url);
            setImageCandidates([
              {
                url: savedProduct.image_url,
                productName: savedProduct.display_name,
                source: 'saved',
              },
            ]);
            return null;
          }
          return searchProductImages(query);
        })
        .then((results) => {
          if (results && imageSearchRequest.current === requestId) setImageCandidates(results);
        })
        .finally(() => {
          if (imageSearchRequest.current === requestId) setImageSearchBusy(false);
        });
    }, 700);
    return () => clearTimeout(timeout);
  }, [name, household.id]);

  function startEditing(item: ShoppingItem): void {
    setEditingItem(item);
    setEditName(item.name);
    setEditQuantity(item.quantity || '1');
    setEditCategory((ITEM_CATEGORIES as readonly string[]).includes(item.category) ? item.category as ItemCategory : 'Otros');
    setError(null);
  }

  function cancelEditing(): void {
    setEditingItem(null);
    setEditName('');
    setError(null);
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
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setSelectedImageUrl(await uploadProductImage({
          householdId: household.id,
          uri: result.assets[0].uri,
          contentType: result.assets[0].mimeType,
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la foto del producto.');
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function addItem(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addShoppingItem({
        householdId: household.id,
        name,
        quantity,
        category,
        imageUrl: selectedImageUrl,
      });
      setItems((current) => [created, ...current]);
      setName('');
      setQuantity('1');
      setSelectedImageUrl(null);
      setImageCandidates([]);
      try {
        await rememberPurchasedProduct({
          householdId: household.id,
          name,
          category,
          imageUrl: selectedImageUrl,
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
        candidate.id === item.id ? { ...candidate, is_completed: completing } : candidate,
      ),
    );
    try {
      await setItemCompleted(item.id, completing);
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

  function renderItem({ item }: { item: ShoppingItem }) {
    const meta = CATEGORY_META[item.category as ItemCategory] ?? CATEGORY_META.Otros;
    return (
      <AnimatedRow>
        <View style={[styles.itemRow, item.is_completed && styles.itemCompleted]}>
          <FunCheckbox checked={item.is_completed} onPress={() => void toggleItem(item)} />
          <Pressable style={styles.itemMain} onPress={() => void toggleItem(item)}>
            <View style={styles.itemNameRow}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.itemImage} />
              ) : (
                <Text style={styles.itemEmoji}>{meta.emoji}</Text>
              )}
              <Text style={[styles.itemName, item.is_completed && styles.itemNameDone]}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.itemMeta}>
              {item.quantity} · {item.category}
            </Text>
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

  const headerStyle = {
    opacity: headerIn,
    transform: [
      {
        translateY: headerIn.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }),
      },
    ],
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <AmbientGroceries />
      <ConfettiBurst trigger={celebrate} />

      <View style={styles.content}>
      <Animated.View style={[styles.header, headerStyle]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LISTA COMPARTIDA</Text>
          <Text style={styles.title}>
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
        <View style={styles.headerActions}>
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
        <View style={styles.addRow}>
          <TextInput
            style={styles.itemInput}
            value={name}
            onChangeText={changeProductName}
            onSubmitEditing={() => void addItem()}
            returnKeyType="done"
            placeholder="Añadir producto…"
            placeholderTextColor={COLORS.mutedDeep}
          />
          <Pressable
            style={({ pressed }) => [styles.quantityPickerButton, pressed && styles.pressed]}
            onPress={() => setQuantityPickerTarget('new')}
            accessibilityRole="button"
            accessibilityLabel={`Cantidad: ${quantity}. Abrir selector`}
          >
            <Text style={styles.quantityValue}>{quantity}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={COLORS.muted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}
            onPress={() => void takeProductPhoto()}
            disabled={imageUploadBusy}
            accessibilityLabel="Hacer foto del producto"
          >
            {imageUploadBusy ? <ActivityIndicator color={COLORS.cyan} size="small" /> : <MaterialCommunityIcons name="camera-outline" size={21} color={COLORS.cyan} />}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={() => void addItem()}
            disabled={busy}
            accessibilityLabel="Añadir producto"
          >
            {busy ? (
              <ActivityIndicator color={COLORS.bg} size="small" />
            ) : (
              <MaterialCommunityIcons name="plus" size={26} color={COLORS.bg} />
            )}
          </Pressable>
        </View>
        {imageSearchBusy ? (
          <View style={styles.imageSearchStatus}>
            <ActivityIndicator color={COLORS.cyan} size="small" />
            <Text style={styles.imageSearchText}>Buscando imágenes de {name.trim()}…</Text>
          </View>
        ) : null}
        {imageCandidates.length ? (
          <FlatList
            horizontal
            data={imageCandidates}
            keyExtractor={(candidate) => candidate.url}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imageCandidates}
            renderItem={({ item: candidate }) => (
              <Pressable
                style={[styles.imageCandidate, selectedImageUrl === candidate.url && styles.imageCandidateSelected]}
                onPress={() => setSelectedImageUrl(candidate.url)}
                accessibilityLabel={`Usar imagen de ${candidate.productName}`}
              >
                <Image source={{ uri: candidate.url }} style={styles.candidateImage} />
                {selectedImageUrl === candidate.url ? (
                  <View style={styles.imageSelectedBadge}>
                    <MaterialCommunityIcons name="check" size={13} color={COLORS.bg} />
                  </View>
                ) : null}
                <Text numberOfLines={1} style={styles.candidateLabel}>
                  {candidate.source === 'transparent' ? 'Sin fondo' : candidate.source === 'saved' ? 'Guardada' : candidate.productName}
                </Text>
              </Pressable>
            )}
          />
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
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          data={ITEM_CATEGORIES}
          keyExtractor={(value) => value}
          renderItem={({ item: option }) => {
            const active = category === option;
            return (
              <Pressable
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(option)}
              >
                <Text style={styles.categoryEmoji}>{CATEGORY_META[option].emoji}</Text>
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {option}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <Modal
        visible={editingItem !== null && quantityPickerTarget !== 'edit'}
        transparent
        animationType="fade"
        onRequestClose={cancelEditing}
      >
        <View style={styles.modalBackdrop}>
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
                  onPress={() => setQuantityPickerTarget('edit')}
                >
                  <Text style={styles.editQuantityText}>{editQuantity}</Text>
                  <MaterialCommunityIcons name="unfold-more-horizontal" size={17} color={COLORS.muted} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.editLabel}>CATEGORÍA</Text>
            <FlatList
              horizontal
              data={ITEM_CATEGORIES}
              keyExtractor={(value) => value}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.editCategories}
              renderItem={({ item: option }) => {
                const active = editCategory === option;
                return (
                  <Pressable
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setEditCategory(option)}
                  >
                    <Text style={styles.categoryEmoji}>{CATEGORY_META[option].emoji}</Text>
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                      {option}
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
        </View>
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
                <Text style={styles.quantityModalTitle}>¿Cuántas unidades?</Text>
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
                initialScrollIndex={Math.max(0, Number(quantityPickerTarget === 'edit' ? editQuantity : quantity) - 1)}
                getItemLayout={(_, index) => ({
                  length: QUANTITY_ITEM_HEIGHT,
                  offset: QUANTITY_ITEM_HEIGHT * index,
                  index,
                })}
                snapToInterval={QUANTITY_ITEM_HEIGHT}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onMomentumScrollEnd={({ nativeEvent }) => {
                  const index = Math.min(
                    QUANTITY_OPTIONS.length - 1,
                    Math.max(0, Math.round(nativeEvent.contentOffset.y / QUANTITY_ITEM_HEIGHT)),
                  );
                  if (quantityPickerTarget === 'edit') setEditQuantity(QUANTITY_OPTIONS[index]);
                  else setQuantity(QUANTITY_OPTIONS[index]);
                }}
                renderItem={({ item: option }) => (
                  <Pressable
                    style={styles.wheelItem}
                    onPress={() => {
                      if (quantityPickerTarget === 'edit') setEditQuantity(option);
                      else setQuantity(option);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar cantidad ${option}`}
                  >
                    <Text style={[styles.wheelText, option === quantity && styles.wheelTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                )}
              />
              <View pointerEvents="none" style={styles.wheelSelection} />
            </View>
            <Pressable
              style={({ pressed }) => [styles.confirmQuantityButton, pressed && styles.pressed]}
              onPress={() => setQuantityPickerTarget(null)}
            >
              <Text style={styles.confirmQuantityText}>
                Usar {quantityPickerTarget === 'edit' ? editQuantity : quantity}
              </Text>
              <MaterialCommunityIcons name="check" size={19} color={COLORS.bg} />
            </Pressable>
          </View>
        </View>
      </Modal>

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
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
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
  ambientLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  ambientItem: { position: 'absolute', opacity: 0.14 },
  ambientEmoji: { fontSize: 30 },
  ambientOne: { top: 138, right: 10 },
  ambientTwo: { top: 330, left: 7 },
  ambientThree: { bottom: 125, right: 20 },
  content: { flex: 1, width: '100%', maxWidth: 760, zIndex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.lime, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 5, color: COLORS.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  count: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  countDone: { color: COLORS.mutedDeep, fontSize: 13 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
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
  itemInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 13,
    color: COLORS.text,
    fontSize: 15,
  },
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
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.lime,
  },
  addButtonPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  imageSearchStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10, paddingHorizontal: 2 },
  imageSearchText: { color: COLORS.muted, fontSize: 11 },
  imageCandidates: { gap: 8, paddingTop: 10, paddingBottom: 2 },
  imageCandidate: { position: 'relative', width: 74, paddingBottom: 3, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.panelDeep, overflow: 'hidden' },
  imageCandidateSelected: { borderColor: COLORS.lime, backgroundColor: '#183323' },
  candidateImage: { width: '100%', height: 58, backgroundColor: '#f4f6f1' },
  candidateLabel: { paddingHorizontal: 5, paddingTop: 4, color: COLORS.muted, fontSize: 9 },
  imageSelectedBadge: { position: 'absolute', top: 5, right: 5, alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.lime },
  selectedImageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9, paddingHorizontal: 2 },
  selectedImageText: { flex: 1, color: COLORS.limeDeep, fontSize: 11, fontWeight: '700' },
  categoryRow: { gap: 7, paddingTop: 11, paddingBottom: 2 },
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
  list: { flex: 1 },
  listContent: { paddingBottom: 18 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.line,
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
  itemMain: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemImage: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f4f6f1' },
  itemEmoji: { fontSize: 15 },
  itemName: { color: COLORS.textSoft, fontSize: 15, fontWeight: '700' },
  itemNameDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  itemMeta: { marginTop: 4, color: COLORS.mutedDeep, fontSize: 11 },
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
