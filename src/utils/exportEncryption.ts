import { toByteArray } from "base64-js";
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytes,
} from "expo-crypto";
import { pbkdf2Sha256 } from "@utils/pbkdf2";

export const ENCRYPTED_FORMAT = "owngains-encrypted";
export const ENCRYPTED_VERSION = 3;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptedExport {
  format: typeof ENCRYPTED_FORMAT;
  version: number;
  /** Hex-encoded key-derivation salt. */
  salt: string;
  /** Base64 of IV + ciphertext + GCM tag. */
  data: string;
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const PBKDF2_ITERATIONS = 600_000;
/** PBKDF2-HMAC-SHA256. */
const deriveKey = async (
  passphrase: string,
  salt: string,
): Promise<AESEncryptionKey> => {
  const encoder = new TextEncoder();
  return AESEncryptionKey.import(
    await pbkdf2Sha256(
      encoder.encode(passphrase),
      encoder.encode(salt),
      PBKDF2_ITERATIONS,
    ),
  );
};

export const isEncryptedExport = (value: unknown): value is EncryptedExport =>
  typeof value === "object" &&
  value !== null &&
  (value as EncryptedExport).format === ENCRYPTED_FORMAT &&
  typeof (value as EncryptedExport).data === "string" &&
  typeof (value as EncryptedExport).salt === "string";

/** Encrypts with a fresh random salt, always at the current `ENCRYPTED_VERSION`. */
export const encryptExport = async (
  payload: unknown,
  passphrase: string,
): Promise<EncryptedExport> => {
  const salt = toHex(getRandomBytes(SALT_BYTES));
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(JSON.stringify(payload)),
    await deriveKey(passphrase, salt),
    { nonce: { length: IV_BYTES }, tagLength: TAG_BYTES },
  );
  return {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    salt,
    data: await sealed.combined("base64"),
  };
};

/**
 * @throws When the file is from another app version, or the passphrase is wrong
 * or the data damaged (AES-GCM cannot tell those apart).
 */
export const decryptExport = async (
  envelope: EncryptedExport,
  passphrase: string,
): Promise<unknown> => {
  if (envelope.version > ENCRYPTED_VERSION) {
    throw new Error(
      "This file was encrypted by a newer version of OwnGains. Update the app and try again.",
    );
  }
  if (envelope.version !== ENCRYPTED_VERSION) {
    throw new Error(
      "This file was encrypted by an older version of OwnGains and can't be opened.",
    );
  }
  const key = await deriveKey(passphrase, envelope.salt);
  let plaintext: Uint8Array;
  try {
    // fromCombined is the one native entry point that does not base64-decode a
    // string argument, so it has to be handed real bytes.
    plaintext = await aesDecryptAsync(
      AESSealedData.fromCombined(toByteArray(envelope.data), {
        ivLength: IV_BYTES,
        tagLength: TAG_BYTES,
      }),
      key,
    );
  } catch (error) {
    throw new Error("Wrong passphrase, or the file is damaged.", {
      cause: error,
    });
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
};
