import { useEffect } from "react"
import { Linking } from "react-native"
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native"
import { trackFeature } from "@shared/services/crashReporting"
import { parseSkinRef } from "../skinRef"

/**
 * Opens `owngains://skin/<id>` links in the Skins screen. A link that arrives before sign-in
 * or onboarding is held until the Skins route exists.
 */
export function useSkinDeepLink(navigationRef: NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>): void {
  useEffect(() => {
    let pending: { importRef: string; marketplace: string | null } | null = null
    const flush = () => {
      if (!pending || !navigationRef.isReady() || !navigationRef.getRootState()?.routeNames.includes("Skins")) return
      ;(navigationRef.navigate as unknown as (name: string, params: object) => void)("Skins", pending)
      pending = null
    }
    const handle = (url: string | null | undefined) => {
      const ref = url && url.startsWith("owngains://skin/") ? parseSkinRef(url) : null
      if (!ref) return
      trackFeature("skins", "deep_link", { otherMarketplace: ref.marketplace !== null })
      pending = { importRef: String(ref.id), marketplace: ref.marketplace }
      flush()
    }
    void Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener("url", ({ url }) => handle(url))
    const unsubscribe = navigationRef.addListener("state", flush)
    return () => {
      sub.remove()
      unsubscribe()
    }
  }, [navigationRef])
}
