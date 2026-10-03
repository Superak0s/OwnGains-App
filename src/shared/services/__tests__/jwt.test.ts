import { accessTokenExpiresAt, accessTokenLifetimeMs } from "../jwt"

const jwtWith = (payload: object): string =>
  `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`

describe("accessTokenExpiresAt", () => {
  it("reads exp as epoch milliseconds from an unpadded base64url payload", () => {
    expect(accessTokenExpiresAt(jwtWith({ sub: "u~?", exp: 1_800_000_000 }))).toBe(
      1_800_000_000_000,
    )
  })

  it("returns null for tokens it cannot read", () => {
    expect(accessTokenExpiresAt("stored-token")).toBeNull()
    expect(accessTokenExpiresAt("a.!!!.c")).toBeNull()
    expect(accessTokenExpiresAt(jwtWith({ sub: "x" }))).toBeNull()
  })
})

describe("accessTokenLifetimeMs", () => {
  it("is exp minus iat, whatever the device clock says", () => {
    expect(accessTokenLifetimeMs(jwtWith({ iat: 1_000, exp: 1_900 }))).toBe(900_000)
  })

  it("returns null without both claims", () => {
    expect(accessTokenLifetimeMs(jwtWith({ exp: 1_900 }))).toBeNull()
    expect(accessTokenLifetimeMs("opaque")).toBeNull()
  })
})
