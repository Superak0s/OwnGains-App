import { useCallback, useRef } from "react";
import { newIdempotencyKey } from "@shared/services/apiClient";

/**
 * An idempotency key that is kept after a failed submit, so tapping save again after
 * a lost response can't log the entry twice. A changed form gets a fresh key.
 */
export function useRetryKey() {
  const ref = useRef<{ signature: string; key: string } | null>(null);

  const keyFor = useCallback((signature: string): string => {
    if (ref.current?.signature !== signature)
      ref.current = { signature, key: newIdempotencyKey() };
    return ref.current.key;
  }, []);

  const reset = useCallback(() => {
    ref.current = null;
  }, []);

  return { keyFor, reset };
}
