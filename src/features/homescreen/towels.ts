import * as FileSystem from "expo-file-system/legacy";
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";

export interface Towel {
  id: string;
  name: string;
  photoUri: string | null;
  washAfter: number;
  uses: number;
  lastUsed: string | null;
}

export interface TowelRack {
  towels: Towel[];
  currentId: string | null;
}

export const loadTowels = async (userId: string | null): Promise<TowelRack> =>
  (await loadFromStorage<TowelRack>(STORAGE_KEYS.TOWELS, userId)) ?? {
    towels: [],
    currentId: null,
  };

export const saveTowels = (userId: string | null, rack: TowelRack): Promise<boolean> =>
  saveToStorage(STORAGE_KEYS.TOWELS, rack, userId);

export const updateTowel = (
  rack: TowelRack,
  id: string,
  change: (towel: Towel) => Partial<Towel>,
): TowelRack => ({
  ...rack,
  towels: rack.towels.map((towel) => (towel.id === id ? { ...towel, ...change(towel) } : towel)),
});

export const washTowel = (rack: TowelRack, id: string): TowelRack =>
  updateTowel(rack, id, () => ({ uses: 0 }));

export async function countTowelUse(userId: string | null, at = new Date()): Promise<void> {
  const rack = await loadTowels(userId);
  if (!rack.currentId) return;
  await saveTowels(
    userId,
    updateTowel(rack, rack.currentId, (towel) => ({
      uses: towel.uses + 1,
      lastUsed: at.toISOString(),
    })),
  );
}

const towelDir = (): string => `${FileSystem.documentDirectory}towels/`;

/** Copies a picked photo into the app's folder, since the picker returns a cache file the OS may clear. */
export async function keepTowelPhoto(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(towelDir(), { intermediates: true }).catch(() => {});
  const dest = `${towelDir()}${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function deleteTowelPhoto(uri: string | null): Promise<void> {
  if (uri?.startsWith(towelDir())) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
