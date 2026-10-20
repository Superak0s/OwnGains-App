import nacl from "tweetnacl"
import { fromByteArray, toByteArray } from "base64-js"
import * as SecureStore from "expo-secure-store"
import { getRandomBytes } from "expo-crypto"
import { sha256 } from "@utils/pbkdf2"

// Hermes has no crypto.getRandomValues, which tweetnacl looks for by default.
nacl.setPRNG((out, n) => out.set(getRandomBytes(n)))

const SECRET_KEY = "trainer_tracking_secret_key"
const DEVICE_ID_KEY = "trainer_tracking_device_id"

export interface DeviceKey {
  deviceId: string
  publicKey: string
  secretKey: Uint8Array
}

/** Box sent to one trainer device, every field base64. */
export interface SealedMessage {
  nonce: string
  senderKey: string
  ciphertext: string
}

/** This device's tracking key pair, made on first use. The private key never leaves the secure store. */
export async function getDeviceKey(): Promise<DeviceKey> {
  let secret = await SecureStore.getItemAsync(SECRET_KEY)
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (!secret || !deviceId) {
    secret = fromByteArray(nacl.box.keyPair().secretKey)
    deviceId = Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("")
    await SecureStore.setItemAsync(SECRET_KEY, secret)
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId)
  }
  const secretKey = toByteArray(secret)
  return {
    deviceId,
    publicKey: fromByteArray(nacl.box.keyPair.fromSecretKey(secretKey).publicKey),
    secretKey,
  }
}

/** Encrypts to one device with a fresh sender key per message, so clients need no key of their own. */
export function seal(plaintext: Uint8Array, recipientPublicKey: string): SealedMessage {
  const sender = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const box = nacl.box(plaintext, nonce, toByteArray(recipientPublicKey), sender.secretKey)
  return {
    nonce: fromByteArray(nonce),
    senderKey: fromByteArray(sender.publicKey),
    ciphertext: fromByteArray(box),
  }
}

/** @returns null when the message wasn't encrypted to this key or was altered. */
export function open(message: SealedMessage, secretKey: Uint8Array): Uint8Array | null {
  try {
    return nacl.box.open(
      toByteArray(message.ciphertext),
      toByteArray(message.nonce),
      toByteArray(message.senderKey),
      secretKey,
    )
  } catch {
    return null
  }
}

/**
 * Short code a client and trainer can compare in person. It matches only when
 * the server handed the client this trainer's real device keys.
 */
export function safetyCode(publicKeys: readonly string[]): string {
  const digest = sha256(new TextEncoder().encode([...publicKeys].sort().join(",")))
  // 128 bits, so a server can't find a substitute key whose code matches.
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")
  return hex.toUpperCase().match(/.{4}/g)!.join(" ")
}
