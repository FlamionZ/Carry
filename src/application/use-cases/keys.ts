import { vaultWrapContext } from "../../domain/canonical";
import { type Bytes, utf8Encode } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import type { CommunityKeyRecord } from "../../infrastructure/db/db";
import { aesDecrypt, aesEncrypt, importGroupKey, newNonce } from "../../infrastructure/crypto/webcrypto";
import type { Device } from "../device";

async function vaultKey(device: Device): Promise<CryptoKey> {
  const vault = await device.db.deviceVault.get("default");
  if (!vault) throw new CarryError("IDENTITY_MISSING", "This device has no local key vault.");
  return vault.vaultKey;
}

/** Wrap group key bytes under the non-extractable device vault key. */
export async function wrapGroupKey(
  device: Device,
  communityId: string,
  keyEpoch: number,
  raw: Bytes,
): Promise<CommunityKeyRecord> {
  const nonce = newNonce();
  const wrapped = await aesEncrypt(
    await vaultKey(device),
    nonce,
    raw,
    utf8Encode(vaultWrapContext(communityId, keyEpoch)),
  );
  return {
    id: `${communityId}:${keyEpoch}`,
    communityId,
    keyEpoch,
    wrappedKey: wrapped.buffer,
    wrapNonce: nonce.buffer,
    createdAt: device.now(),
  };
}

/** Unwrap raw group key bytes. Only used by the admin to deliver the key to a new member. */
export async function unwrapGroupKeyBytes(device: Device, communityId: string, keyEpoch: number): Promise<Bytes> {
  const record = await device.db.communityKeys.get(`${communityId}:${keyEpoch}`);
  if (!record) throw new CarryError("KEY_EPOCH_MISMATCH");
  return aesDecrypt(
    await vaultKey(device),
    new Uint8Array(record.wrapNonce),
    new Uint8Array(record.wrappedKey),
    utf8Encode(vaultWrapContext(communityId, keyEpoch)),
  );
}

/** Load the community AES-GCM key as a non-extractable CryptoKey. */
export async function loadGroupKey(device: Device, communityId: string, keyEpoch: number): Promise<CryptoKey> {
  const raw = await unwrapGroupKeyBytes(device, communityId, keyEpoch);
  try {
    return await importGroupKey(raw);
  } finally {
    raw.fill(0);
  }
}
