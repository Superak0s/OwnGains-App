import { apiCall, parseApiResponse } from "@shared/services/apiClient";
import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import type { ApiResponse } from "@features/tracking/services/types";
import { File } from "expo-file-system";

async function saveTo(path: string, destUri: string): Promise<boolean> {
  const res = await authenticatedFetch(path);
  if (res.status === 404) return false;
  if (!res.ok) await parseApiResponse(res);
  new File(destUri).write(new Uint8Array(await res.arrayBuffer()));
  return true;
}

export const profilePhotoApi = {
  upload: async (
    uri: string,
  ): Promise<ApiResponse<{ hash: string } | null>> => {
    const form = new FormData();
    form.append("photo", new File(uri));
    const res = await authenticatedFetch("/api/profile/photo", {
      method: "PUT",
      body: form,
      timeoutMs: 60_000,
    });
    return parseApiResponse<ApiResponse<{ hash: string } | null>>(res);
  },

  remove: async (): Promise<ApiResponse<null>> =>
    apiCall("/api/profile/photo", { method: "DELETE" }),

  /** Writes the caller's photo to `destUri`. Resolves false when there is none. */
  download: (destUri: string): Promise<boolean> =>
    saveTo("/api/profile/photo", destUri),

  /** Writes a friend's photo to `destUri`. Resolves false when there is none or they aren't a friend. */
  downloadFor: (userId: string, destUri: string): Promise<boolean> =>
    saveTo(`/api/profile/photo/${encodeURIComponent(userId)}`, destUri),
};
