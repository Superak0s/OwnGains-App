import type { ApiResponse } from "@features/tracking/services/types";

// The photo is already on the device and offline mode has no friends, so there is nothing to sync.
export const profilePhotoApi = {
  upload: async (
    _uri: string,
  ): Promise<ApiResponse<{ hash: string } | null>> => ({
    success: true,
    data: null,
  }),
  remove: async (): Promise<ApiResponse<null>> => ({ success: true, data: null }),
  download: async (_destUri: string): Promise<boolean> => false,
  downloadFor: async (_userId: string, _destUri: string): Promise<boolean> =>
    false,
};
