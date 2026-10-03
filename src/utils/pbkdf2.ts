const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK = 64;
const DIGEST = 32;

const W = new Uint32Array(64);

const compress = (h: Uint32Array, data: Uint8Array, offset: number): void => {
  for (let i = 0; i < 16; i += 1) {
    const p = offset + i * 4;
    W[i] = (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
  }
  for (let i = 16; i < 64; i += 1) {
    const x = W[i - 15];
    const y = W[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }

  let a = h[0];
  let b = h[1];
  let c = h[2];
  let d = h[3];
  let e = h[4];
  let f = h[5];
  let g = h[6];
  let hh = h[7];

  for (let i = 0; i < 64; i += 1) {
    const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + s1 + ch + K[i] + W[i]) | 0;
    const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + maj) | 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }

  h[0] = (h[0] + a) | 0;
  h[1] = (h[1] + b) | 0;
  h[2] = (h[2] + c) | 0;
  h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0;
  h[5] = (h[5] + f) | 0;
  h[6] = (h[6] + g) | 0;
  h[7] = (h[7] + hh) | 0;
};

const writeState = (h: Uint32Array, out: Uint8Array, offset: number): void => {
  for (let i = 0; i < 8; i += 1) {
    const v = h[i];
    out[offset + i * 4] = v >>> 24;
    out[offset + i * 4 + 1] = (v >>> 16) & 0xff;
    out[offset + i * 4 + 2] = (v >>> 8) & 0xff;
    out[offset + i * 4 + 3] = v & 0xff;
  }
};

/** Length in bits, big-endian, into the last 8 bytes of a padded block. */
const writeBitLength = (buf: Uint8Array, end: number, byteLength: number): void => {
  const bits = byteLength * 8;
  buf[end - 4] = (bits >>> 24) & 0xff;
  buf[end - 3] = (bits >>> 16) & 0xff;
  buf[end - 2] = (bits >>> 8) & 0xff;
  buf[end - 1] = bits & 0xff;
  // Progress photos keep exports well under 2^32 bits, so the high word stays 0.
};

export const sha256 = (data: Uint8Array): Uint8Array => {
  const padded = new Uint8Array(
    (Math.floor((data.length + 8) / BLOCK) + 1) * BLOCK,
  );
  padded.set(data);
  padded[data.length] = 0x80;
  writeBitLength(padded, padded.length, data.length);

  const h = new Uint32Array(INIT);
  for (let offset = 0; offset < padded.length; offset += BLOCK) {
    compress(h, padded, offset);
  }
  const out = new Uint8Array(DIGEST);
  writeState(h, out, 0);
  return out;
};

interface HmacKey {
  readonly innerState: Uint32Array;
  readonly outerState: Uint32Array;
}

const hmacKey = (key: Uint8Array): HmacKey => {
  const normalized = new Uint8Array(BLOCK);
  normalized.set(key.length > BLOCK ? sha256(key) : key);

  const pad = new Uint8Array(BLOCK);
  const innerState = new Uint32Array(INIT);
  for (let i = 0; i < BLOCK; i += 1) pad[i] = normalized[i] ^ 0x36;
  compress(innerState, pad, 0);

  const outerState = new Uint32Array(INIT);
  for (let i = 0; i < BLOCK; i += 1) pad[i] = normalized[i] ^ 0x5c;
  compress(outerState, pad, 0);

  return { innerState, outerState };
};

/**
 * HMAC over a message already buffered into `block` (a multiple of 64 bytes,
 * padded and length-stamped for a total of BLOCK + messageLength bytes).
 */
const hmacPadded = (key: HmacKey, block: Uint8Array, out: Uint8Array): void => {
  const h = new Uint32Array(key.innerState);
  for (let offset = 0; offset < block.length; offset += BLOCK) {
    compress(h, block, offset);
  }

  const outer = new Uint8Array(BLOCK);
  writeState(h, outer, 0);
  outer[DIGEST] = 0x80;
  writeBitLength(outer, BLOCK, BLOCK + DIGEST);

  const o = new Uint32Array(key.outerState);
  compress(o, outer, 0);
  writeState(o, out, 0);
};

const padMessage = (message: Uint8Array): Uint8Array => {
  const total = BLOCK + message.length;
  const block = new Uint8Array(
    (Math.floor((message.length + 8) / BLOCK) + 1) * BLOCK,
  );
  block.set(message);
  block[message.length] = 0x80;
  writeBitLength(block, block.length, total);
  return block;
};

/** Iterations between yields, so the UI thread keeps painting during a derive. */
const YIELD_EVERY = 10_000;

/**
 * PBKDF2-HMAC-SHA256 (RFC 2898) producing a 32-byte key, in pure JS because
 * expo-crypto exposes no key-derivation primitive and its native `digest` costs
 * a bridge round trip per call, and 600k of those would freeze the app for
 * minutes. The loop yields periodically so a derive never blocks a frame for
 * long.
 *
 * ponytail: PBKDF2 is not memory-hard, so a GPU still parallelises it. A native
 * Argon2id module is the upgrade path if export files become a real target.
 */
export const pbkdf2Sha256 = async (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> => {
  const key = hmacKey(password);

  const seed = new Uint8Array(salt.length + 4);
  seed.set(salt);
  seed[seed.length - 1] = 1;

  const u = new Uint8Array(DIGEST);
  hmacPadded(key, padMessage(seed), u);

  const result = new Uint8Array(u);
  const block = padMessage(new Uint8Array(DIGEST));

  for (let i = 1; i < iterations; i += 1) {
    block.set(u);
    hmacPadded(key, block, u);
    for (let j = 0; j < DIGEST; j += 1) result[j] ^= u[j];
    if (i % YIELD_EVERY === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return result;
};
