import { useCallback, useRef } from "react";
import { generateId } from "@utils/format";

/**
 * An idempotency key that is kept after a failed submit, so tapping save again after
 * a lost response can't log the entry twice. A changed form gets a fresh key.
 */
export function useRetryKey() {
  const ref = useRef<{ signature: string; key: string } | null>(null);

  const keyFor = useCallback((signature: string): string => {
    if (ref.current?.signature !== signature)
      ref.current = { signature, key: generateId("idem") };
    return ref.current.key;
  }, []);

  const reset = useCallback(() => {
    ref.current = null;
  }, []);

  return { keyFor, reset };
}
