/**
 * Web Crypto adapter. Only browser primitives are used (AES-GCM, ECDSA P-256,
 * ECDH P-256, HKDF-SHA-256, SHA-256). No custom cryptography.
 */
import { canonicalJson } from "../../domain/canonical";
import { type Bytes, b64uToBytes, bytesToB64u, randomBytes, utf8Encode } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import type { PublicJwk } from "../../domain/packet/schemas";

/** `crypto.subtle` only exists in secure contexts (HTTPS or localhost). */
const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new CarryError("INSECURE_CONTEXT");
  return globalThis.crypto.subtle;
};

const ECDSA_PARAMS = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle().digest("SHA-256", data));
}

export async function sha256B64u(text: string): Promise<string> {
  return bytesToB64u(await sha256(utf8Encode(text)));
}

/** Strip a JWK to the public EC members only. */
export function toPublicJwk(jwk: JsonWebKey): PublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("Expected a P-256 public JWK");
  }
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export function sameJwk(a: PublicJwk, b: PublicJwk): boolean {
  return a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y;
}

/** Human-comparable fingerprint: first 8 bytes of SHA-256(canonical JWK), hex groups. */
export async function fingerprint(jwk: PublicJwk): Promise<string> {
  const digest = await sha256(utf8Encode(canonicalJson(toPublicJwk(jwk))));
  const hex = Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return hex.match(/.{4}/g)!.join(" ");
}

// ── ECDSA ────────────────────────────────────────────────────────────────

export interface SigningKeyPair {
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  // extractable=false applies to the private key; public keys stay exportable.
  const pair = (await subtle().generateKey(ECDSA_PARAMS, false, ["sign", "verify"])) as CryptoKeyPair;
  const publicJwk = toPublicJwk(await subtle().exportKey("jwk", pair.publicKey));
  return { privateKey: pair.privateKey, publicJwk };
}

/** Returns a Base64URL IEEE-P1363 (r||s, 64 bytes) signature. */
export async function sign(privateKey: CryptoKey, data: Bytes): Promise<string> {
  return bytesToB64u(new Uint8Array(await subtle().sign(ECDSA_SIGN, privateKey, data)));
}

export async function verify(publicJwk: PublicJwk, signatureB64u: string, data: Bytes): Promise<boolean> {
  try {
    const key = await subtle().importKey("jwk", toPublicJwk(publicJwk), ECDSA_PARAMS, false, ["verify"]);
    return await subtle().verify(ECDSA_SIGN, key, b64uToBytes(signatureB64u), data);
  } catch {
    return false;
  }
}

// ── ECDH + HKDF ───────────────────────────────────────────────────────────

export interface EcdhKeyPair {
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const pair = (await subtle().generateKey(ECDH_PARAMS, false, ["deriveBits"])) as CryptoKeyPair;
  const publicJwk = toPublicJwk(await subtle().exportKey("jwk", pair.publicKey));
  return { privateKey: pair.privateKey, publicJwk };
}

/** ECDH shared bits → HKDF-SHA-256 → one-time AES-GCM-256 wrapping key. */
export async function deriveWrappingKey(
  privateKey: CryptoKey,
  peerPublicJwk: PublicJwk,
  salt: Bytes,
  info: string,
): Promise<CryptoKey> {
  const peer = await subtle().importKey("jwk", toPublicJwk(peerPublicJwk), ECDH_PARAMS, false, []);
  const shared = await subtle().deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const ikm = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8Encode(info) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── AES-GCM ───────────────────────────────────────────────────────────────

export function newNonce(): Bytes {
  return randomBytes(12);
}

export async function aesEncrypt(key: CryptoKey, nonce: Bytes, plaintext: Bytes, aad: Bytes): Promise<Bytes> {
  if (nonce.length !== 12) throw new Error("AES-GCM nonce must be 96 bits");
  return new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 }, key, plaintext),
  );
}

/** Throws DECRYPTION_FAILED on any authentication failure. */
export async function aesDecrypt(key: CryptoKey, nonce: Bytes, ciphertext: Bytes, aad: Bytes): Promise<Bytes> {
  try {
    return new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 }, key, ciphertext),
    );
  } catch {
    throw new CarryError("DECRYPTION_FAILED");
  }
}

export async function generateVaultKey(): Promise<CryptoKey> {
  return (await subtle().generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ])) as CryptoKey;
}

export function generateGroupKeyBytes(): Bytes {
  return randomBytes(32);
}

export async function importGroupKey(raw: Bytes): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("Group key must be 32 bytes");
  return subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
