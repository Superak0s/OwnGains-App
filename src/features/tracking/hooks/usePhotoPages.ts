import { useCallback, useRef, useState } from "react";
import { progressPhotoApi } from "../services";
import { captureException } from "@shared/services/crashReporting";
import type { PhotoCursor, ProgressPhotoMuscle } from "../types/muscleRecovery";

export const PHOTO_PAGE_SIZE = 50;

export function usePhotoPages() {
  const [photos, setPhotos] = useState<ProgressPhotoMuscle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const cursorRef = useRef<PhotoCursor | null>(null);
  const generationRef = useRef(0);
  const pendingMoreRef = useRef<Promise<void> | null>(null);

  const fetchPage = useCallback(async (reset: boolean): Promise<void> => {
    if (reset) {
      generationRef.current += 1;
      pendingMoreRef.current = null;
    }
    const generation = generationRef.current;
    try {
      const page = await progressPhotoApi.getPhotoPage(
        reset ? null : cursorRef.current,
        PHOTO_PAGE_SIZE,
      );
      if (generation !== generationRef.current) return;
      cursorRef.current = page.nextCursor;
      setLoadFailed(false);
      setHasMore(page.nextCursor !== null);
      setPhotos((prev) => {
        if (reset) return page.data;
        const seen = new Set(prev.map((p) => String(p.id)));
        return [...prev, ...page.data.filter((p) => !seen.has(String(p.id)))];
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      // A failed page must not look like the end of the list, or a retry is
      // impossible. Stop paging only on success.
      setLoadFailed(true);
      console.error("Failed to load photos:", error);
      captureException(error, { stage: "loadProgressPhotos" });
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchPage(true), [fetchPage]);

  const loadMore = useCallback((): Promise<void> => {
    if (!cursorRef.current) return Promise.resolve();
    pendingMoreRef.current ??= (async () => {
      setLoadingMore(true);
      try {
        await fetchPage(false);
      } finally {
        pendingMoreRef.current = null;
        setLoadingMore(false);
      }
    })();
    return pendingMoreRef.current;
  }, [fetchPage]);

  const loadAll = useCallback(async (): Promise<void> => {
    await fetchPage(true);
    const generation = generationRef.current;
    let previous: PhotoCursor | null = null;
    while (
      cursorRef.current &&
      cursorRef.current !== previous &&
      generation === generationRef.current
    ) {
      previous = cursorRef.current;
      await loadMore();
    }
  }, [fetchPage, loadMore]);

  return {
    photos,
    setPhotos,
    loading,
    loadingMore,
    hasMore,
    loadFailed,
    refresh,
    loadMore,
    loadAll,
  };
}
