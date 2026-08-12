import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import type { Household, ItemCategory, ShoppingItem } from '../types';
import { ITEM_CATEGORIES } from '../types';

type Props = {
  household: Household;
  userId: string;
  onSignOut: () => void;
};

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
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, is_completed: !item.is_completed } : candidate,
      ),
    );
    try {
      await setItemCompleted(item.id, !item.is_completed);
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
    return (
      <View style={[styles.itemRow, item.is_completed && styles.itemCompleted]}>
        <Pressable
          style={[styles.checkbox, item.is_completed && styles.checkboxDone]}
          onPress={() => void toggleItem(item)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.is_completed }}
        >
          {item.is_completed ? <Text style={styles.check}>✓</Text> : null}
        </Pressable>
        <Pressable style={styles.itemMain} onPress={() => void toggleItem(item)}>
          <Text style={[styles.itemName, item.is_completed && styles.itemNameDone]}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.quantity} · {item.category}
          </Text>
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          onPress={() => void removeItem(item)}
          accessibilityLabel={`Borrar ${item.name}`}
        >
          <Text style={styles.deleteText}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LISTA COMPARTIDA</Text>
          <Text style={styles.title}>{household.name}</Text>
          <Text style={styles.count}>
            {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
          </Text>
        </View>
        <Pressable style={styles.avatar} onPress={onSignOut} accessibilityLabel="Cerrar sesión">
          <Text style={styles.avatarText}>↗</Text>
        </Pressable>
      </View>

      <View style={styles.nfcCard}>
        <View style={styles.nfcIcon}>
          <Text style={styles.nfcIconText}>⌁</Text>
        </View>
        <View style={styles.nfcCopy}>
          <Text style={styles.nfcTitle}>Etiqueta NFC de casa</Text>
          <Text style={styles.nfcSubtitle}>
            {isNfcBaseUrlConfigured
              ? 'Comparte este enlace y escríbelo en una etiqueta NFC.'
              : 'Usando la URL actual de la app. Configura EXPO_PUBLIC_NFC_BASE_URL para un dominio estable.'}
          </Text>
        </View>
        <Pressable onPress={() => void shareNfcLink()}>
          <Text style={styles.shareAction}>Compartir</Text>
        </Pressable>
      </View>
      <View style={styles.nfcActions}>
        <Text numberOfLines={1} style={styles.nfcUrl}>
          {nfcUrl}
        </Text>
        <Pressable onPress={() => void copyNfcLink()} style={styles.copyButton}>
          <Text style={styles.copyText}>{copied ? 'Copiado' : 'Copiar'}</Text>
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
            placeholderTextColor="#71808a"
          />
          <TextInput
            style={styles.quantityInput}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />
          <Pressable
            style={styles.addButton}
            onPress={() => void addItem()}
            disabled={busy}
            accessibilityLabel="Añadir producto"
          >
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          data={ITEM_CATEGORIES}
          keyExtractor={(value) => value}
          renderItem={({ item: option }) => (
            <Pressable
              style={[styles.categoryChip, category === option && styles.categoryChipActive]}
              onPress={() => setCategory(option)}
            >
              <Text style={[styles.categoryText, category === option && styles.categoryTextActive]}>
                {option}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <View style={styles.listToolbar}>
        <Pressable onPress={() => setShowCompleted((value) => !value)}>
          <Text style={styles.filterText}>
            {showCompleted
              ? 'Ocultar completados'
              : `Ver completados${completedCount ? ` · ${completedCount}` : ''}`}
          </Text>
        </Pressable>
        {completedCount ? (
          <Pressable onPress={() => void clearCompleted()}>
            <Text style={styles.clearText}>Limpiar</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#a7f36a" style={styles.loader} /> : null}
      {!loading && !visibleItems.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✦</Text>
          <Text style={styles.emptyTitle}>
            {search ? 'No hay coincidencias' : 'Tu lista está despejada'}
          </Text>
          <Text style={styles.emptyText}>
            {search ? 'Prueba con otro nombre.' : 'Añade el primer producto para empezar.'}
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
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar en la lista"
          placeholderTextColor="#71808a"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071312', paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 18,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#a7f36a', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 5, color: '#f2f7f4', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  count: { marginTop: 4, color: '#8ca39c', fontSize: 13 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#173a32',
  },
  avatarText: { color: '#c1e7a3', fontSize: 20, fontWeight: '800' },
  nfcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: '#2a5142',
    borderRadius: 17,
    backgroundColor: '#10231f',
  },
  nfcIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#23493b',
  },
  nfcIconText: { color: '#a7f36a', fontSize: 24 },
  nfcCopy: { flex: 1 },
  nfcTitle: { color: '#dcefe2', fontSize: 13, fontWeight: '800' },
  nfcSubtitle: { marginTop: 2, color: '#8ca39c', fontSize: 11, lineHeight: 15 },
  shareAction: { color: '#a7f36a', fontSize: 12, fontWeight: '800' },
  nfcActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  nfcUrl: { flex: 1, color: '#617c73', fontSize: 10 },
  copyButton: { padding: 4 },
  copyText: { color: '#a7f36a', fontSize: 11, fontWeight: '800' },
  addCard: { marginTop: 18, padding: 12, borderRadius: 18, backgroundColor: '#10231f' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#294740',
    borderRadius: 13,
    color: '#f2f7f4',
    fontSize: 15,
  },
  quantityInput: {
    width: 45,
    height: 46,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#294740',
    borderRadius: 13,
    color: '#f2f7f4',
    fontSize: 15,
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#a7f36a',
  },
  addButtonText: { color: '#10210e', fontSize: 24, fontWeight: '600', lineHeight: 25 },
  categoryRow: { gap: 7, paddingTop: 11, paddingBottom: 2 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#17332c',
  },
  categoryChipActive: { backgroundColor: '#a7f36a' },
  categoryText: { color: '#9badab', fontSize: 11, fontWeight: '700' },
  categoryTextActive: { color: '#10210e' },
  listToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 7,
  },
  filterText: { color: '#9badab', fontSize: 12, fontWeight: '700' },
  clearText: { color: '#ff9d92', fontSize: 12, fontWeight: '800' },
  error: { marginVertical: 6, color: '#ff9d92', fontSize: 12 },
  loader: { marginTop: 28 },
  list: { flex: 1 },
  listContent: { paddingBottom: 18 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#10231f',
  },
  itemCompleted: { opacity: 0.58 },
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 25,
    height: 25,
    marginRight: 11,
    borderWidth: 1.5,
    borderColor: '#527461',
    borderRadius: 9,
  },
  checkboxDone: { borderColor: '#a7f36a', backgroundColor: '#a7f36a' },
  check: { color: '#10210e', fontSize: 16, fontWeight: '900' },
  itemMain: { flex: 1 },
  itemName: { color: '#e5f2e9', fontSize: 15, fontWeight: '700' },
  itemNameDone: { color: '#8ca39c', textDecorationLine: 'line-through' },
  itemMeta: { marginTop: 4, color: '#718b85', fontSize: 11 },
  deleteButton: { padding: 7 },
  deleteText: { color: '#718b85', fontSize: 22, fontWeight: '300' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  emptyIcon: { color: '#a7f36a', fontSize: 28 },
  emptyTitle: { marginTop: 9, color: '#dcefe2', fontSize: 17, fontWeight: '800' },
  emptyText: { marginTop: 5, color: '#718b85', fontSize: 13 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    marginBottom: Platform.OS === 'ios' ? 8 : 12,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#1d3631',
    borderRadius: 14,
    backgroundColor: '#0b1b18',
  },
  searchIcon: { marginRight: 8, color: '#718b85', fontSize: 22 },
  searchInput: { flex: 1, color: '#f2f7f4', fontSize: 14 },
});
