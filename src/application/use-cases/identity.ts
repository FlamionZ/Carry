import { randomId } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import { LIMITS } from "../../domain/limits";
import type { LocalIdentityRecord } from "../../infrastructure/db/db";
import { generateSigningKeyPair, generateVaultKey } from "../../infrastructure/crypto/webcrypto";
import { auditEvent } from "../audit";
import type { Device } from "../device";

export function normalizeName(raw: string): string {
  const name = raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > LIMITS.maxNameLength) {
    throw new CarryError("INPUT_INVALID", `Use 1–${LIMITS.maxNameLength} characters.`);
  }
  return name;
}

export async function getIdentity(device: Device): Promise<LocalIdentityRecord | undefined> {
  return device.db.localIdentity.get("local");
}

export async function requireIdentity(device: Device): Promise<LocalIdentityRecord> {
  const identity = await getIdentity(device);
  if (!identity) throw new CarryError("IDENTITY_MISSING");
  return identity;
}

/** Create the device identity (ECDSA P-256) and local vault key once. */
export async function createIdentity(device: Device, displayName: string): Promise<LocalIdentityRecord> {
  const name = normalizeName(displayName);
  const existing = await getIdentity(device);
  if (existing) return existing;

  const signing = await generateSigningKeyPair();
  const vaultKey = await generateVaultKey();
  const now = device.now();
  const identity: LocalIdentityRecord = {
    id: "local",
    memberId: randomId(16),
    displayName: name,
    signingPrivateKey: signing.privateKey,
    signingPublicJwk: signing.publicJwk,
    createdAt: now,
  };

  await device.db.transaction("rw", device.db.localIdentity, device.db.deviceVault, device.db.auditEvents, async () => {
    // Re-check inside the transaction; never overwrite an existing identity or vault.
    if (await device.db.localIdentity.get("local")) return;
    await device.db.localIdentity.add(identity);
    if (!(await device.db.deviceVault.get("default"))) {
      await device.db.deviceVault.add({ id: "default", vaultKey, createdAt: now });
    }
    await auditEvent(device, "IDENTITY_CREATED", identity.memberId, null);
  });
  return (await getIdentity(device))!;
}

/** Changes the local display name used for future join requests/communities. */
export async function updateDisplayName(device: Device, displayName: string): Promise<void> {
  const name = normalizeName(displayName);
  await device.db.localIdentity.update("local", { displayName: name });
}
