import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "./storage"

/**
 * Set when a program edit was saved locally but its server write failed. The
 * server then holds an older copy, and the next sync must not merge it back
 * over the local one. It pushes the local program up instead.
 */
export const markProgramDirty = (userId: string | null): Promise<boolean> =>
  saveToStorage(STORAGE_KEYS.PROGRAM_DIRTY, true, userId)

export const clearProgramDirty = (userId: string | null): Promise<boolean> =>
  saveToStorage(STORAGE_KEYS.PROGRAM_DIRTY, false, userId)

export const isProgramDirty = async (userId: string | null): Promise<boolean> =>
  (await loadFromStorage<boolean>(STORAGE_KEYS.PROGRAM_DIRTY, userId)) === true
