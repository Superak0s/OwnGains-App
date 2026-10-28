import { useEffect, useState } from "react"
import { canAuthenticate, DEFAULT_MARKETPLACE_URL, getMarketplaceUrl } from "../services/marketplace"

/** Whether publishing and rating are open, and the line shown in their place when they aren't. */
export function useMarketplaceAccount(visible = true): { canSignIn: boolean | null; signInLine: string } {
  const [canSignIn, setCanSignIn] = useState<boolean | null>(null)
  const [base, setBase] = useState(DEFAULT_MARKETPLACE_URL)
  useEffect(() => {
    if (!visible) return
    void getMarketplaceUrl().then(setBase)
    void canAuthenticate().then(setCanSignIn)
  }, [visible])
  const signInLine =
    base === DEFAULT_MARKETPLACE_URL
      ? "Sign in to the official server to publish and rate skins."
      : `Sign in to a server at ${new URL(base).host} to publish and rate skins.`
  return { canSignIn, signInLine }
}
