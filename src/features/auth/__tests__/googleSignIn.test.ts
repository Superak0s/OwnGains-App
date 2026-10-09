const mockSignIn = jest.fn()
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signOut: jest.fn(async () => null),
    signIn: () => mockSignIn(),
  },
}))

let mockOfficial = true
jest.mock("@shared/services/config", () => ({
  isOfficialServer: () => mockOfficial,
  getServerUrl: () => "https://self-hosted.example",
  assertSecureTransport: jest.fn(),
}))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

import { authService } from "@features/auth/services/on/auth"
import { GoogleSignInCancelledError } from "@features/auth/googleSignIn"

const fetchMock = jest.fn()

beforeEach(() => {
  mockOfficial = true
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web-client"
  mockSignIn.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe("signInWithGoogle", () => {
  it("refuses on any other server without opening Google or sending a request", async () => {
    mockOfficial = false
    await expect(authService.signInWithGoogle()).rejects.toThrow("official OwnGains server")
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuses when the build has no web client ID", async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    await expect(authService.signInWithGoogle()).rejects.toThrow()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it("reports a closed Google sheet as a cancellation, not a failed request", async () => {
    mockSignIn.mockResolvedValue({ type: "cancelled", data: null })
    await expect(authService.signInWithGoogle()).rejects.toBeInstanceOf(GoogleSignInCancelledError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts the Google ID token to /api/auth/google", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "goog-token" } })
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, token: "t", refreshToken: "r", user: { id: "u", username: "g" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const data = await authService.signInWithGoogle()
    expect(data.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://self-hosted.example/api/auth/google")
    expect(JSON.parse(init.body as string)).toEqual({ idToken: "goog-token" })
  })
})
