const readTimeClaim = (token: string, claim: "exp" | "iat"): number | null => {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/")
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
    const value = (JSON.parse(json) as Record<string, unknown>)[claim]
    return typeof value === "number" ? value * 1000 : null
  } catch {
    return null
  }
}

/** Epoch ms from the JWT `exp` claim, or null when the token isn't a readable JWT. */
export const accessTokenExpiresAt = (token: string): number | null =>
  readTimeClaim(token, "exp")

/** The token's own lifetime (`exp − iat`) in ms, independent of the device clock. */
export const accessTokenLifetimeMs = (token: string): number | null => {
  const exp = readTimeClaim(token, "exp")
  const iat = readTimeClaim(token, "iat")
  return exp == null || iat == null ? null : exp - iat
}
