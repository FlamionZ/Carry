/** Shape of src/test/vectors/carry-v1.json (written by scripts/generate-vectors.ts). */

/** Which device state the verifier rebuilds before scanning the vector. */
export type VectorReceiver = "admin" | "member" | "pendingMember";

export interface InvalidVector {
  name: string;
  receiver: VectorReceiver;
  /** Raw QR frame strings, scanned in order. */
  frames?: string[];
  /** A Base64URL payload; the verifier wraps it in fresh C1 frames. */
  payload?: string;
  /** Expected error code from src/domain/errors.ts. */
  error: string;
}

export interface GoldenVectors {
  protocol: "CARRY/1";
  description: string;
  /** Clock used while generating; every valid vector is valid at `verifyAt`. */
  generatedAt: number;
  verifyAt: number;
  keys: {
    /** Raw 32-byte community key, Base64URL. Test-only. */
    groupKey: string;
    /** The joining device's per-request ECDH private key, needed to open the approval. Test-only. */
    memberRequestEcdhPrivateJwk: JsonWebKey;
  };
  context: {
    communityId: string;
    communityName: string;
    keyEpoch: number;
    adminMemberId: string;
    adminDisplayName: string;
    memberId: string;
    memberDisplayName: string;
    inviteId: string;
    /** SHA-256 of the invite secret, as the admin device stores it. */
    inviteSecretHash: string;
    inviteCreatedAt: number;
    inviteExpiresAt: number;
    joinRequestExpiresAt: number;
    messageText: string;
    memberMessageText: string;
  };
  valid: {
    invite: string;
    joinRequest: string;
    joinApproval: string;
    /** MESSAGE from the admin. */
    message: string;
    /** The same MESSAGE as C1 frames. */
    messageFrames: string[];
    /** The same MESSAGE after one relay (hopCount 1). */
    messageRelayed: string;
    /** ACK from the member for `message`. */
    ack: string;
    /** MESSAGE from the member. */
    memberMessage: string;
  };
  invalid: InvalidVector[];
}
