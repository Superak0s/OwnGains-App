jest.mock("expo-crypto", () => {
  const nodeCrypto = require("crypto");
  const IV_BYTES = 12;
  const TAG_BYTES = 16;

  class AESEncryptionKey {
    raw: Buffer;
    constructor(raw: Buffer) {
      this.raw = raw;
    }
    static async import(bytes: Uint8Array) {
      return new AESEncryptionKey(Buffer.from(bytes));
    }
  }

  class AESSealedData {
    combinedBytes: Buffer;
    constructor(combinedBytes: Buffer) {
      this.combinedBytes = combinedBytes;
    }
    static fromCombined(combined: Uint8Array) {
      // Guards the native contract: Android's fromCombined takes bytes only and
      // silently misreads a base64 string.
      if (!(combined instanceof Uint8Array)) {
        throw new TypeError("fromCombined needs bytes, not a string");
      }
      return new AESSealedData(Buffer.from(combined));
    }
    async combined(_encoding: "base64") {
      return this.combinedBytes.toString("base64");
    }
  }

  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digest: async (_algorithm: string, data: Uint8Array) =>
      Uint8Array.from(
        nodeCrypto.createHash("sha256").update(Buffer.from(data)).digest(),
      ).buffer,
    AESEncryptionKey,
    AESSealedData,
    aesEncryptAsync: async (plaintext: Uint8Array, key: AESEncryptionKey) => {
      const iv = nodeCrypto.randomBytes(IV_BYTES);
      const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key.raw, iv);
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(plaintext)),
        cipher.final(),
      ]);
      return new AESSealedData(
        Buffer.concat([iv, ciphertext, cipher.getAuthTag()]),
      );
    },
    aesDecryptAsync: async (sealed: AESSealedData, key: AESEncryptionKey) => {
      const buf = sealed.combinedBytes;
      const decipher = nodeCrypto.createDecipheriv(
        "aes-256-gcm",
        key.raw,
        buf.subarray(0, IV_BYTES),
      );
      decipher.setAuthTag(buf.subarray(buf.length - TAG_BYTES));
      return new Uint8Array(
        Buffer.concat([
          decipher.update(buf.subarray(IV_BYTES, buf.length - TAG_BYTES)),
          decipher.final(),
        ]),
      );
    },
  };
});

import nodeCrypto from "crypto";

import {
  decryptExport,
  encryptExport,
  ENCRYPTED_VERSION,
  isEncryptedExport,
} from "../exportEncryption";

const payload = {
  format: "owngains-backup",
  kv: { "@profile_phone": "555-0100" },
  records: {},
};

describe("exportEncryption", () => {
  it("round-trips a payload through the right passphrase", async () => {
    const envelope = await encryptExport(payload, "correct horse");
    await expect(decryptExport(envelope, "correct horse")).resolves.toEqual(
      payload,
    );
  });

  it("rejects a wrong passphrase instead of returning garbage", async () => {
    const envelope = await encryptExport(payload, "correct horse");
    await expect(decryptExport(envelope, "wrong horse")).rejects.toThrow(
      /Wrong passphrase/,
    );
  });

  it("leaves no plaintext in the exported file", async () => {
    const envelope = await encryptExport(payload, "correct horse");
    expect(JSON.stringify(envelope)).not.toContain("555-0100");
  });

  it("uses a fresh salt per export", async () => {
    const a = await encryptExport(payload, "correct horse");
    const b = await encryptExport(payload, "correct horse");
    expect(a.salt).not.toEqual(b.salt);
    expect(a.data).not.toEqual(b.data);
  });

  it("recognizes its own envelope but not a plain backup", () => {
    expect(
      isEncryptedExport({
        format: "owngains-encrypted",
        version: 1,
        salt: "ab",
        data: "xx",
      }),
    ).toBe(true);
    expect(isEncryptedExport(payload)).toBe(false);
    expect(isEncryptedExport(null)).toBe(false);
  });

  it("stamps the current format version", async () => {
    const envelope = await encryptExport(payload, "correct horse");
    expect(envelope.version).toBe(ENCRYPTED_VERSION);
  });

  it("still opens a version 1 envelope written by the single-round KDF", async () => {
    const salt = nodeCrypto.randomBytes(16).toString("hex");
    const key = nodeCrypto
      .createHash("sha256")
      .update(`${salt}:correct horse`)
      .digest();
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
      iv,
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");

    await expect(
      decryptExport(
        { format: "owngains-encrypted", version: 1, salt, data },
        "correct horse",
      ),
    ).resolves.toEqual(payload);
  });

  it("still opens a version 2 envelope written by the 100k-round SHA-256 KDF", async () => {
    const salt = nodeCrypto.randomBytes(16).toString("hex");
    const saltBytes = Buffer.from(salt, "utf8");
    let hash = nodeCrypto
      .createHash("sha256")
      .update(`${salt}:correct horse`, "utf8")
      .digest();
    for (let round = 0; round < 100_000; round += 1) {
      hash = nodeCrypto
        .createHash("sha256")
        .update(Buffer.concat([saltBytes, hash]))
        .digest();
    }
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", hash, iv);
    const data = Buffer.concat([
      iv,
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");

    await expect(
      decryptExport(
        { format: "owngains-encrypted", version: 2, salt, data },
        "correct horse",
      ),
    ).resolves.toEqual(payload);
  });

  it("refuses a file written by a newer format version", async () => {
    const envelope = await encryptExport(payload, "correct horse");
    await expect(
      decryptExport({ ...envelope, version: 99 }, "correct horse"),
    ).rejects.toThrow(/newer version/);
  });
});
