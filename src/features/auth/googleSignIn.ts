import { GoogleSignin } from "@react-native-google-signin/google-signin"
import { isOfficialServer } from "@shared/services/config"

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super("Google sign-in was cancelled")
  }
}

export interface GoogleLink {
  readonly idToken: string
  readonly password: string
}

/** The Google email matches an existing account, whose password must be sent with the same token. */
export class GoogleLinkNeedsPasswordError extends Error {
  constructor(
    readonly idToken: string,
    readonly username: string,
  ) {
    super("An OwnGains account already uses this email")
  }
}

// The Android OAuth client is bound to our package and signing key, and only the
// official server sets GOOGLE_WEB_CLIENT_ID, so no other server is ever offered a token.
export const isGoogleSignInAvailable = (): boolean =>
  isOfficialServer() && !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

export async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleSignInAvailable())
    throw new Error("Google sign-in is only available on the official OwnGains server")
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID })
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  // Without this the library reuses the last account silently, so the user could
  // never pick a different one.
  await GoogleSignin.signOut().catch(() => null)
  const response = await GoogleSignin.signIn()
  if (response.type === "cancelled") throw new GoogleSignInCancelledError()
  if (!response.data.idToken) throw new Error("Google did not return a sign-in token")
  return response.data.idToken
}
