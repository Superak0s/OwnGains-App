import * as FileSystem from "expo-file-system/legacy"
import { generateId } from "@utils/format"
import { compressImageForUpload, makeThumbnail } from "@utils/compressImage"
import { createRecordStore } from "@shared/services/offlineHelpers"
import type {
  ProgressPhotoMuscle,
  LogProgressPhotoParams,
  MuscleGroup,
  PhotoCursor,
  PhotoPage,
} from "../../types/muscleRecovery"
import type { ApiResponse } from "../types"

const PHOTOS_KEY = "@off_progress_photos_muscle"
const PHOTOS_DIR = `${FileSystem.documentDirectory}progress-photos/`

const store = createRecordStore<ProgressPhotoMuscle>(
  "progress_photos_muscle",
  PHOTOS_KEY,
  (p) => p.id,
  (p) => p.takenAt ?? "",
)

const deleteFiles = async (uris: (string | undefined)[]): Promise<void> => {
  for (const uri of uris) {
    if (!uri) continue
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
  }
}

// The grid falls back to the full image, so a missing thumbnail only costs memory.
const saveThumbnail = async (from: string, to: string): Promise<string | undefined> => {
  const thumb = await makeThumbnail(from)
  if (!thumb) return undefined
  const saved = await FileSystem.copyAsync({ from: thumb, to }).then(
    () => to,
    () => undefined,
  )
  await deleteFiles([thumb])
  return saved
}

export const progressPhotoApi = {
  uploadPhoto: async (params: LogProgressPhotoParams): Promise<ApiResponse<ProgressPhotoMuscle>> => {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(() => {
      // already exists, which is fine
    })

    const id = generateId()
    const destUri = `${PHOTOS_DIR}${id}.jpg`
    const compressedUri = await compressImageForUpload(params.uri)
    let thumbUri: string | undefined
    try {
      await FileSystem.copyAsync({ from: compressedUri, to: destUri })
      thumbUri = await saveThumbnail(compressedUri, `${PHOTOS_DIR}${id}_thumb.jpg`)
    } finally {
      if (compressedUri !== params.uri) await deleteFiles([compressedUri])
    }

    const photo: ProgressPhotoMuscle = {
      id,
      takenAt: params.takenAt || new Date().toISOString(),
      uri: destUri,
      thumbUri,
      muscleGroups: params.muscleGroups,
      note: params.note || null,
      angle: params.angle || "custom",
      customSideName: params.customSideName || undefined,
    }
    try {
      await store.put(photo)
    } catch (error) {
      await deleteFiles([destUri, thumbUri])
      throw error
    }
    return { success: true, data: photo }
  },

  getAllPhotos: async (limit: number = 100): Promise<ApiResponse<ProgressPhotoMuscle[]>> => {
    const data = await store.getRecent(limit)
    return { success: true, data }
  },

  getPhotoPage: async (cursor: PhotoCursor | null, limit: number): Promise<PhotoPage> => {
    const data = await store.getPageBefore(
      cursor && { sortKey: cursor.before, id: cursor.beforeId },
      limit,
    )
    const last = data.at(-1)
    return {
      success: true,
      data,
      nextCursor:
        data.length === limit && last
          ? { before: last.takenAt ?? "", beforeId: String(last.id) }
          : null,
    }
  },

  getPhotosByMuscle: async (muscle: MuscleGroup): Promise<ApiResponse<ProgressPhotoMuscle[]>> => {
    const photos = await store.getAll()
    const filtered = photos.filter((p) => p.muscleGroups?.includes(muscle))
    return { success: true, data: filtered }
  },

  deletePhoto: async (id: string | number): Promise<ApiResponse<null>> => {
    const photo = await store.getOne(id)
    await deleteFiles([photo?.uri, photo?.thumbUri])
    await store.remove(id)
    return { success: true, data: null }
  },
}
