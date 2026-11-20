import type { CertificateBody, MessageKind, PublicJwk } from "../../domain/packet/schemas";

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

// ── Relay entry vectors ─────────────────────────────────────────────────────
// Shape of src/test/vectors/carry-v1-relay.json (written by
// scripts/generate-vectors-relay.ts): relay entries, message kinds and the
// acknowledgement journey (PACKET_PROTOCOL.md §5, §10, §11A).

/**
 * author: the administrator's phone holding its own outbound message.
 * member: the acknowledging member's phone before it scanned the message.
 */
export type RelayVectorReceiver = "author" | "member";

/** A relaying member and its admin-issued certificate (public data). */
export interface RelayVectorMember {
  memberId: string;
  displayName: string;
  certificate: {
    body: CertificateBody;
    adminSignature: string;
  };
}

/** One hop as the verifier must show it. */
export interface RelayVectorHop {
  hop: number;
  memberId: string;
  at: number;
}

export interface RelayInvalidVector {
  name: string;
  receiver: RelayVectorReceiver;
  /** Member IDs of `context.relayers` whose certificates the receiving device holds. */
  knownRelayers: string[];
  /** A Base64URL payload; the verifier wraps it in fresh C1 frames. */
  payload: string;
  /** Expected error code from src/domain/errors.ts. */
  error: string;
}

export interface RelayGoldenVectors {
  protocol: "CARRY/1";
  description: string;
  /** Clock used at the start of generation; every valid vector is valid at `verifyAt`. */
  generatedAt: number;
  verifyAt: number;
  keys: {
    /** Raw 32-byte community key, Base64URL. Test-only. */
    groupKey: string;
  };
  context: {
    communityId: string;
    communityName: string;
    keyEpoch: number;
    adminMemberId: string;
    adminDisplayName: string;
    adminSigningPublicJwk: PublicJwk;
    /** The member who receives the message and acknowledges it. */
    acknowledgerMemberId: string;
    acknowledgerDisplayName: string;
    acknowledgerSigningPublicJwk: PublicJwk;
    /** Members who relayed the message and the ACK. Their certificates make them known. */
    relayers: RelayVectorMember[];
    messageText: string;
    messageKind: MessageKind;
    /** The message's relay entries in `messageRelayedTwice`. */
    messageJourney: RelayVectorHop[];
    /** The ACK's own relay entries in `ackRelayedTwice`. */
    ackJourney: RelayVectorHop[];
  };
  valid: {
    /** MESSAGE from the admin with `kind`, as created (hopCount 0, no entries). */
    message: string;
    /** The same MESSAGE after the first relay: one entry. */
    messageRelayedOnce: string;
    /** The same MESSAGE after the second relay: two chained entries. */
    messageRelayedTwice: string;
    /** ACK from the acknowledger; its encrypted body carries `messageRelay` copied from `messageRelayedTwice`. */
    ack: string;
    /** The same ACK after one relay on the way back. */
    ackRelayedOnce: string;
    /** The same ACK after two relays on the way back. */
    ackRelayedTwice: string;
  };
  invalid: RelayInvalidVector[];
}
