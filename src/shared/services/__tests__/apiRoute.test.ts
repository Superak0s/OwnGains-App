jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

import { routeOf } from "../authenticatedFetch"

describe("routeOf", () => {
  it("strips the origin and the query string", () => {
    expect(routeOf("https://owngains.example.com/api/workouts?limit=10")).toBe(
      "/api/workouts",
    )
  })

  it("collapses ids so attributes remain low-cardinality", () => {
    expect(routeOf("/api/sessions/4821/sets")).toBe("/api/sessions/:id/sets")
    expect(routeOf("/api/sessions/local_1712345678900")).toBe(
      "/api/sessions/:id",
    )
    expect(routeOf("/api/users/9f8e7d6c5b4a3928/profile")).toBe(
      "/api/users/:id/profile",
    )
  })

  it("masks split and muscle names", () => {
    expect(routeOf("/api/sessions/split/Push%20Day")).toBe("/api/sessions/split/:name")
    expect(routeOf("/api/tracking/injuries/muscle/Biceps")).toBe(
      "/api/tracking/injuries/muscle/:name",
    )
    expect(routeOf("/api/tracking/photos/muscle/group/Chest")).toBe(
      "/api/tracking/photos/muscle/group/:name",
    )
    expect(routeOf("/api/tracking/photos/muscle?limit=5")).toBe("/api/tracking/photos/muscle")
  })

  it("keeps non-id segments intact", () => {
    expect(routeOf("/api/auth/refresh")).toBe("/api/auth/refresh")
  })
})
