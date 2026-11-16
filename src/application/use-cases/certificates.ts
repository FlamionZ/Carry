import { canonicalJson } from "../../domain/canonical";
import { type Bytes, concatBytes, utf8Encode } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import type { CertificateBody, MemberCertificate, PublicJwk } from "../../domain/packet/schemas";
import { sha256, sign, verify } from "../../infrastructure/crypto/webcrypto";

export function certificateBytes(body: CertificateBody): Bytes {
  return utf8Encode(canonicalJson(body));
}

export async function signCertificate(adminPrivateKey: CryptoKey, body: CertificateBody): Promise<MemberCertificate> {
  return { body, adminSignature: await sign(adminPrivateKey, certificateBytes(body)) };
}

/** SHA256(canonicalCertificateBody || adminSignature) — bound into packet and approval signatures. */
export async function certificateHash(cert: MemberCertificate): Promise<Bytes> {
  return sha256(concatBytes(certificateBytes(cert.body), utf8Encode(cert.adminSignature)));
}

/** Verifies the admin signature and that the certificate belongs to the expected community/epoch. */
export async function assertCertificate(
  cert: MemberCertificate,
  adminSigningPublicJwk: PublicJwk,
  expected: { communityId: string; keyEpoch: number; memberId?: string },
): Promise<void> {
  if (
    cert.body.communityId !== expected.communityId ||
    cert.body.keyEpoch !== expected.keyEpoch ||
    (expected.memberId !== undefined && cert.body.memberId !== expected.memberId)
  ) {
    throw new CarryError("CERTIFICATE_INVALID");
  }
  const ok = await verify(adminSigningPublicJwk, cert.adminSignature, certificateBytes(cert.body));
  if (!ok) throw new CarryError("CERTIFICATE_INVALID");
}
