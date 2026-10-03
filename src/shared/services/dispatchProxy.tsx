import { isServerless } from "./appMode"
import { isFeatureLocal, markFeatureLocal } from "./localOnlyFeatures"
import { ApiError, OFFLINE_UNAVAILABLE_MESSAGE } from "./apiError"
import { trackFeature } from "./crashReporting"

export { OFFLINE_UNAVAILABLE_MESSAGE }

const countCall = async <R,>(
  name: string | undefined,
  op: string,
  mode: "online" | "offline",
  call: () => R,
): Promise<Awaited<R>> => {
  if (!name) return await call()
  try {
    const result = await call()
    trackFeature(name, op, { mode, outcome: "ok" })
    return result
  } catch (error) {
    trackFeature(name, op, { mode, outcome: "error" })
    throw error
  }
}

// `any` in the constraint is required: `unknown[]`/`never[]` parameters
// make every concrete service method fail the constraint contravariantly.
export function createDispatchProxy<
  T extends Record<string, (...args: any[]) => any>,
>(onImpl: T, offImpl: T, feature?: string, metricName = feature): T {
  const proxy = {} as Record<keyof T, (...args: unknown[]) => unknown>

  for (const key of Object.keys(onImpl) as Array<keyof T>) {
    proxy[key] = async (...args: unknown[]) => {
      const useOff =
        (await isServerless()) ||
        (feature !== undefined && (await isFeatureLocal(feature)))
      const call = (off: boolean) =>
        countCall(metricName, String(key), off ? "offline" : "online", () =>
          (off ? offImpl : onImpl)[key](...args),
        )
      try {
        return await call(useOff)
      } catch (error) {
        // The server stopped storing this feature since the list was read:
        // switch to on-device now and serve this call there, not as a failure.
        if (
          useOff ||
          feature === undefined ||
          !(error instanceof ApiError && error.code === FEATURE_LOCAL_ONLY)
        )
          throw error
        await markFeatureLocal(feature)
        return call(true)
      }
    }
  }

  return proxy as T
}

export const FEATURE_LOCAL_ONLY = "FEATURE_LOCAL_ONLY"


/**
 * For features that are inherently server-mediated and have no offline twin
 * (friends, sharing). Without this they would keep issuing real requests
 * with an `offline_…` bearer token in a mode documented as zero-backend.
 */
export function createOnlineOnlyProxy<
  T extends Record<string, (...args: any[]) => any>,
>(onImpl: T, metricName?: string): T {
  const proxy = {} as Record<keyof T, (...args: unknown[]) => unknown>

  for (const key of Object.keys(onImpl) as Array<keyof T>) {
    proxy[key] = async (...args: unknown[]) => {
      if (await isServerless()) throw new Error(OFFLINE_UNAVAILABLE_MESSAGE)
      return countCall(metricName, String(key), "online", () =>
        onImpl[key](...args),
      )
    }
  }

  return proxy as T
}
