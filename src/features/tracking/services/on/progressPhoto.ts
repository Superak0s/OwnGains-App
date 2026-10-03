import {
  apiCall,
  parseApiResponse,
  parseRetryAfterMs,
  responseCode,
} from "@shared/services/apiClient";
import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import { getServerUrl } from "@shared/services/config";
import { File } from "expo-file-system";
import { compressImageForUpload } from "@utils/compressImage";
import type {
  ApiResponse,
  ProgressPhotoMuscle,
  LogProgressPhotoParams,
  MuscleGroup,
  PhotoCursor,
  PhotoPage,
} from "../../types/muscleRecovery";

// The path is whatever the server sent back, so only a rooted one is joined:
// "//host/x" or "https://host/x" would otherwise silently repoint the image at
// another origin.
function absoluteServerPath(path: string | undefined): string | undefined {
  if (!path || !/^\/[^/]/.test(path)) return undefined;
  return `${getServerUrl()}${path}`;
}

function withAbsoluteUri(photo: ProgressPhotoMuscle): ProgressPhotoMuscle {
  return {
    ...photo,
    uri: absoluteServerPath(photo.uri),
    thumbUri: absoluteServerPath(photo.thumbUri),
  };
}

// A compressed photo over a phone uplink routinely outlasts the 15s an API call
// gets.
const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;
const MAX_BUSY_WAIT_MS = 10_000;

export const progressPhotoApi = {
  uploadPhoto: async (params: LogProgressPhotoParams): Promise<ApiResponse<ProgressPhotoMuscle>> => {
    const compressedUri = await compressImageForUpload(params.uri);
    const takenAt = params.takenAt || new Date().toISOString();

    const buildForm = (): FormData => {
      const formData = new FormData();
      // Expo's fetch rejects React Native's `{ uri, name, type }` part with
      // "Unsupported FormDataPart implementation" because it only reads real Blobs.
      formData.append("photo", new File(compressedUri));
      formData.append("muscleGroups", JSON.stringify(params.muscleGroups));
      formData.append("takenAt", takenAt);
      formData.append("angle", params.angle || "custom");
      if (params.note) formData.append("note", params.note);
      if (params.customSideName) formData.append("customSideName", params.customSideName);
      return formData;
    };
    const send = () =>
      authenticatedFetch("/api/tracking/photos/muscle", {
        method: "POST",
        body: buildForm(),
        timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
      });

    try {
      let response = await send();
      // 503 UPLOAD_BUSY means the server never started decoding, so one wait-and-resend is safe.
      const busyWaitMs =
        response.status === 503 && (await responseCode(response)) === "UPLOAD_BUSY"
          ? parseRetryAfterMs(response)
          : undefined;
      if (busyWaitMs !== undefined && busyWaitMs <= MAX_BUSY_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, busyWaitMs));
        response = await send();
      }
      return await parseApiResponse<ApiResponse<ProgressPhotoMuscle>>(response);
    } finally {
      if (compressedUri !== params.uri) {
        try {
          new File(compressedUri).delete();
        } catch {
          // The OS evicts cache files on its own.
        }
      }
    }
  },

  getAllPhotos: async (limit: number = 100): Promise<ApiResponse<ProgressPhotoMuscle[]>> => {
    const res = await apiCall<ApiResponse<ProgressPhotoMuscle[]>>(`/api/tracking/photos/muscle?limit=${limit}`);
    return { ...res, data: res.data?.map(withAbsoluteUri) };
  },

  getPhotoPage: async (cursor: PhotoCursor | null, limit: number): Promise<PhotoPage> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set("before", cursor.before);
      params.set("beforeId", cursor.beforeId);
    }
    const res = await apiCall<ApiResponse<ProgressPhotoMuscle[]> & { nextCursor?: PhotoCursor | null }>(
      `/api/tracking/photos/muscle?${params.toString()}`,
    );
    // A server without paging ignores the cursor and resends the first page,
    // so a missing nextCursor has to end the list.
    return {
      success: res.success,
      data: (res.data ?? []).map(withAbsoluteUri),
      nextCursor: res.nextCursor ?? null,
    };
  },

  getPhotosByMuscle: async (muscle: MuscleGroup): Promise<ApiResponse<ProgressPhotoMuscle[]>> => {
    const res = await apiCall<ApiResponse<ProgressPhotoMuscle[]>>(`/api/tracking/photos/muscle/group/${encodeURIComponent(muscle)}`);
    return { ...res, data: res.data?.map(withAbsoluteUri) };
  },

  deletePhoto: async (id: string | number): Promise<ApiResponse<null>> =>
    apiCall(`/api/tracking/photos/muscle/${id}`, { method: "DELETE" }),
};
