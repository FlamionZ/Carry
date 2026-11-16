/**
 * Byte/string helpers shared by the protocol. Pure functions only.
 * Base64URL follows RFC 4648 §5 without "=" padding.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

export const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8Encode(text: string): Bytes {
  return encoder.encode(text) as Bytes;
}

/** Strict UTF-8 decode. Throws on invalid byte sequences. */
export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function bytesToB64u(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uToBytes(text: string): Bytes {
  if (!BASE64URL_RE.test(text) || text.length % 4 === 1) {
    throw new Error("Invalid Base64URL");
  }
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  // Reject non-zero trailing bits so every byte string has exactly one text form.
  if (bytesToB64u(out) !== text) throw new Error("Non-canonical Base64URL");
  return out;
}

/** Number of Base64URL characters (unpadded) for `n` bytes. */
export function b64uLength(n: number): number {
  return Math.ceil((n * 4) / 3);
}

export function randomBytes(n: number): Bytes {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Random identifier encoded as Base64URL (default 16 bytes / 128 bits). */
export function randomId(byteLength = 16): string {
  return bytesToB64u(randomBytes(byteLength));
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
