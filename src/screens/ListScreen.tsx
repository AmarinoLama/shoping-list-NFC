import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  addShoppingItem,
  clearCompletedItems,
  deleteShoppingItem,
  getNfcInviteUrl,
  getShoppingItems,
  isNfcBaseUrlConfigured,
  setItemCompleted,
  subscribeToShoppingItems,
} from '../lib/shopping';
import { CATEGORY_META, COLORS } from '../lib/ui';
import type { Household, ItemCategory, ShoppingItem } from '../types';
import { ITEM_CATEGORIES } from '../types';

type Props = {
  household: Household;
  userId: string;
  onSignOut: () => void;
};

const CONFETTI_COLORS = [COLORS.lime, COLORS.cyan, COLORS.amber, COLORS.pink, COLORS.violet];
const CONFETTI_EMOJI = ['⭐', '🛒', '🎉', '🧃'];

export function ListScreen({ household, userId, onSignOut }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ItemCategory>('Despensa');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [celebrate, setCelebrate] = useState(0);

  const headerIn = useRef(new Animated.Value(0)).current;

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
  const nfcUrl = getNfcInviteUrl(household.nfc_token);

  async function addItem(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addShoppingItem({
        householdId: household.id,
        userId,
        name,
        quantity,
        category,
      });
      setItems((current) => [created, ...current]);
      setName('');
      setQuantity('1');
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

  async function copyNfcLink(): Promise<void> {
    await Clipboard.setStringAsync(nfcUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function shareNfcLink(): Promise<void> {
    await Share.share({
      title: `Invitación a ${household.name}`,
      message: `Únete a la lista de ${household.name}: ${nfcUrl}`,
      url: nfcUrl,
    });
  }

  function renderItem({ item }: { item: ShoppingItem }) {
    const meta = CATEGORY_META[item.category as ItemCategory] ?? CATEGORY_META.Otros;
    return (
      <AnimatedRow>
        <View style={[styles.itemRow, item.is_completed && styles.itemCompleted]}>
          <FunCheckbox checked={item.is_completed} onPress={() => void toggleItem(item)} />
          <Pressable style={styles.itemMain} onPress={() => void toggleItem(item)}>
            <View style={styles.itemNameRow}>
              <Text style={styles.itemEmoji}>{meta.emoji}</Text>
              <Text style={[styles.itemName, item.is_completed && styles.itemNameDone]}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.itemMeta}>
              {item.quantity} · {item.category}
            </Text>
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
      <ConfettiBurst trigger={celebrate} />

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
        <Pressable
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          onPress={onSignOut}
          accessibilityLabel="Cerrar sesión"
        >
          <MaterialCommunityIcons name="logout-variant" size={20} color={COLORS.limeDeep} />
        </Pressable>
      </Animated.View>

      {items.length > 0 ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      ) : null}

      <View style={styles.nfcCard}>
        <View style={styles.nfcIcon}>
          <MaterialCommunityIcons name="nfc-variant" size={20} color={COLORS.cyan} />
        </View>
        <View style={styles.nfcCopy}>
          <Text style={styles.nfcTitle}>Etiqueta NFC de casa</Text>
          <Text style={styles.nfcSubtitle}>
            {isNfcBaseUrlConfigured
              ? 'Comparte este enlace y escríbelo en una etiqueta NFC.'
              : 'Usando la URL actual de la app. Configura EXPO_PUBLIC_NFC_BASE_URL para un dominio estable.'}
          </Text>
        </View>
        <Pressable onPress={() => void shareNfcLink()} hitSlop={8} style={styles.shareActionRow}>
          <MaterialCommunityIcons name="share-variant" size={14} color={COLORS.lime} />
          <Text style={styles.shareAction}>Compartir</Text>
        </Pressable>
      </View>
      <View style={styles.nfcActions}>
        <Text numberOfLines={1} style={styles.nfcUrl}>
          {nfcUrl}
        </Text>
        <Pressable
          onPress={() => void copyNfcLink()}
          style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name={copied ? 'check-circle' : 'content-copy'}
            size={15}
            color={copied ? COLORS.lime : COLORS.muted}
          />
          <Text style={[styles.copyText, copied && styles.copyTextDone]}>
            {copied ? 'Copiado' : 'Copiar'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.addCard}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.itemInput}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => void addItem()}
            returnKeyType="done"
            placeholder="Añadir producto…"
            placeholderTextColor={COLORS.mutedDeep}
          />
          <TextInput
            style={styles.quantityInput}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />
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
    </KeyboardAvoidingView>
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
  screen: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
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
  nfcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: '#2a5142',
    borderRadius: 17,
    backgroundColor: COLORS.panel,
  },
  nfcIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#143331',
  },
  nfcCopy: { flex: 1 },
  nfcTitle: { color: COLORS.textSoft, fontSize: 13, fontWeight: '800' },
  nfcSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 15 },
  shareActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  shareAction: { color: COLORS.lime, fontSize: 12, fontWeight: '800' },
  nfcActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  nfcUrl: { flex: 1, color: COLORS.mutedDeep, fontSize: 10 },
  copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  copyText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  copyTextDone: { color: COLORS.lime },
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
  quantityInput: {
    width: 45,
    height: 46,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 13,
    color: COLORS.text,
    fontSize: 15,
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.lime,
  },
  addButtonPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
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
  itemEmoji: { fontSize: 15 },
  itemName: { color: COLORS.textSoft, fontSize: 15, fontWeight: '700' },
  itemNameDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  itemMeta: { marginTop: 4, color: COLORS.mutedDeep, fontSize: 11 },
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
