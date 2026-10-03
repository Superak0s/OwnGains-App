import nodeCrypto from "crypto";

import { pbkdf2Sha256, sha256 } from "@utils/pbkdf2";

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("sha256", () => {
  it.each([
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "the quick brown fox jumps over the lazy dog".repeat(10),
  ])("matches node for %#", (input) => {
    expect(hex(sha256(utf8(input)))).toBe(
      nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex"),
    );
  });
});

describe("pbkdf2Sha256", () => {
  // RFC-style reference vector for PBKDF2-HMAC-SHA256.
  it("matches the published vector for password/salt at 1 iteration", async () => {
    expect(hex(await pbkdf2Sha256(utf8("password"), utf8("salt"), 1))).toBe(
      "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
    );
  });

  it.each([1, 2, 2048, 10_000])(
    "matches node at %i iterations",
    async (iterations) => {
      const password = "correct horse battery staple";
      const salt = nodeCrypto.randomBytes(16).toString("hex");
      expect(hex(await pbkdf2Sha256(utf8(password), utf8(salt), iterations))).toBe(
        nodeCrypto
          .pbkdf2Sync(password, salt, iterations, 32, "sha256")
          .toString("hex"),
      );
    },
  );

  it("handles a passphrase longer than one HMAC block", async () => {
    const password = "p".repeat(200);
    expect(hex(await pbkdf2Sha256(utf8(password), utf8("salty"), 64))).toBe(
      nodeCrypto.pbkdf2Sync(password, "salty", 64, 32, "sha256").toString("hex"),
    );
  });
});
