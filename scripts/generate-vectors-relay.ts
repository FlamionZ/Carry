/**
 * Writes the CARRY/1 relay entry golden vectors (PACKET_PROTOCOL.md §5, §10,
 * §11A, §14) by running the real protocol flows between five simulated
 * devices. Run with `npm run vectors:relay`.
 *
 * The committed file is frozen exactly like carry-v1.json: it proves that new
 * builds still read the relay entries, message kinds and acknowledgement
 * journeys this build writes. The script refuses to overwrite an existing
 * file (the run fails with a refusal message) and never touches carry-v1.json. Delete the file only when introducing a new
 * protocol version.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "vitest";
import { decodePayload, encodePayload } from "../src/application/codec";
import type { Device } from "../src/application/device";
import { createCommunity } from "../src/application/use-cases/communities";
import { createIdentity } from "../src/application/use-cases/identity";
import { unwrapGroupKeyBytes } from "../src/application/use-cases/keys";
import { approveJoinRequest, createInvite, createJoinRequest } from "../src/application/use-cases/membership";
import { composeMessage, createAcknowledgement, preparePacketForQr, readPacket } from "../src/application/use-cases/packets";
import { bytesToB64u } from "../src/domain/encoding";
import { DURATIONS } from "../src/domain/limits";
import type { CarryPayload, PacketEnvelope, RelayEntry } from "../src/domain/packet/schemas";
import { makeDevice, transfer } from "../src/test/helpers";
import type { RelayGoldenVectors, RelayInvalidVector, RelayVectorHop, RelayVectorMember } from "../src/test/vectors/types";

const OUT = "src/test/vectors/carry-v1-relay.json";
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0);
const MINUTE = DURATIONS.minute;

/** Change one Base64URL character away from the end, so the string stays canonical. */
function flipChar(s: string, at = Math.floor(s.length / 2)): string {
  return s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);
}

/** Encode a deliberately broken payload; canonical JSON does not validate. */
const encodeRaw = (value: unknown) => encodePayload(value as CarryPayload);

function changed(encoded: string, edit: (e: PacketEnvelope) => void): string {
  const copy = structuredClone(decodePayload(encoded) as PacketEnvelope);
  edit(copy);
  return encodeRaw(copy);
}

function entriesOf(encoded: string): RelayEntry[] {
  return (decodePayload(encoded) as PacketEnvelope).relay.entries ?? [];
}

const hopsOf = (encoded: string): RelayVectorHop[] => entriesOf(encoded).map(({ hop, memberId, at }) => ({ hop, memberId, at }));

type Phone = ReturnType<typeof makeDevice>;

/** Invitation → join request → approval, moved as QR frames like on real phones. */
async function enroll(admin: Device, member: Device, communityId: string, name: string) {
  const created = await createInvite(admin, communityId);
  await transfer(member, created.encoded);
  const pending = await createJoinRequest(member, created.payload, name);
  const received = await transfer(admin, pending.requestPayload!);
  if (received.kind !== "JOIN_REQUEST") throw new Error("join request was not accepted");
  await transfer(member, await approveJoinRequest(admin, received.requestId));
}

/** Scan a payload on `phone` at its clock + `ms`, then show the relay QR there. */
async function relay(phone: Phone, payload: string, recordId: string, ms: number): Promise<string> {
  phone.advance(ms);
  await transfer(phone, payload);
  return preparePacketForQr(phone, recordId);
}

// Fails with the refusal below when the file exists. `npm run vectors:relay`
// runs only this generator, so carry-v1.json existing does not matter here.
test("generate CARRY/1 relay entry golden vectors", async () => {
  if (existsSync(OUT)) {
    throw new Error(`${OUT} exists. Golden vectors must not change; delete it only for a new protocol version.`);
  }

  // Every phone starts at T0; each relay moves its own clock forward.
  const admin = makeDevice(T0);
  const relayer1 = makeDevice(T0);
  const relayer2 = makeDevice(T0);
  const acknowledger = makeDevice(T0);
  const adminIdentity = await createIdentity(admin, "Alex");
  const relayer1Identity = await createIdentity(relayer1, "Bea");
  const relayer2Identity = await createIdentity(relayer2, "Chen");
  const acknowledgerIdentity = await createIdentity(acknowledger, "Dana");
  const community = await createCommunity(admin, "Riverside Mutual Aid");
  await enroll(admin, relayer1, community.id, "Bea");
  await enroll(admin, relayer2, community.id, "Chen");
  await enroll(admin, acknowledger, community.id, "Dana");

  // The message goes out through Bea and Chen to Dana.
  const messageText = "Pickup moved to 3 pm at the community hall.";
  const message = await composeMessage(admin, community.id, messageText, "CHANGE");
  const messageRelayedOnce = await relay(relayer1, message.encodedEnvelope, message.id, 1 * MINUTE);
  const messageRelayedTwice = await relay(relayer2, messageRelayedOnce, message.id, 2 * MINUTE);

  // Dana acknowledges; the ACK comes back through Chen and Bea to Alex.
  acknowledger.advance(3 * MINUTE);
  await transfer(acknowledger, messageRelayedTwice);
  const ack = await createAcknowledgement(acknowledger, message.id);
  const ackRelayedOnce = await relay(relayer2, ack.encodedEnvelope, ack.id, 2 * MINUTE);
  const ackRelayedTwice = await relay(relayer1, ackRelayedOnce, ack.id, 4 * MINUTE);

  // Sanity: the author accepts the ACK and both journeys are reported.
  admin.advance(6 * MINUTE);
  const imported = await transfer(admin, ackRelayedTwice);
  expect(imported).toMatchObject({ kind: "ACK", acknowledgedOwn: true });
  const [returned] = (await readPacket(admin, message.id)).acknowledgements!;
  expect(returned?.outbound?.hops.map((h) => h.status)).toEqual(["VERIFIED", "VERIFIED"]);
  expect(returned?.back.hops.map((h) => h.status)).toEqual(["VERIFIED", "VERIFIED"]);

  // A forged copied journey: Dana's stored copy of the message has Bea's entry
  // moved by a minute. Dana knows neither relay, so she accepted it, and her
  // ACK copies it honestly. Only the author, who knows both, can tell.
  await acknowledger.db.packets.delete(ack.id);
  await acknowledger.db.acknowledgements.delete(ack.packetId);
  const forgedJourney = changed(messageRelayedTwice, (e) => (e.relay.entries![0]!.at += MINUTE));
  await acknowledger.db.packets.update(message.id, { encodedEnvelope: forgedJourney });
  const forgedAck = await createAcknowledgement(acknowledger, message.id);

  const relayers: RelayVectorMember[] = [];
  for (const identity of [relayer1Identity, relayer2Identity]) {
    const record = await admin.db.memberships.get(`${community.id}:${identity.memberId}`);
    if (!record) throw new Error("the admin has no membership record for a relay");
    relayers.push({
      memberId: record.memberId,
      displayName: record.displayName,
      certificate: { body: record.certificateBody, adminSignature: record.adminSignature },
    });
  }
  const [bea, chen] = [relayer1Identity.memberId, relayer2Identity.memberId];
  const both = [bea, chen];
  const groupKey = bytesToB64u(await unwrapGroupKeyBytes(admin, community.id, community.keyEpoch));
  const adminCert = (decodePayload(message.encodedEnvelope) as PacketEnvelope).memberCertificate.body;
  const ackCert = (decodePayload(ack.encodedEnvelope) as PacketEnvelope).memberCertificate.body;

  const invalid: RelayInvalidVector[] = [
    {
      name: "relay entry count does not match hopCount",
      receiver: "member",
      knownRelayers: both,
      payload: changed(messageRelayedTwice, (e) => (e.relay.hopCount = 3)),
      error: "RELAY_ENTRY_INVALID",
    },
    {
      name: "relay entries out of hop order",
      receiver: "member",
      knownRelayers: both,
      payload: changed(messageRelayedTwice, (e) => e.relay.entries!.reverse()),
      error: "RELAY_ENTRY_INVALID",
    },
    {
      name: "earlier entry from an unknown member changed (broken chain)",
      receiver: "member",
      knownRelayers: [chen],
      payload: changed(messageRelayedTwice, (e) => (e.relay.entries![0]!.at += 1)),
      error: "RELAY_ENTRY_INVALID",
    },
    {
      name: "known member's relay signature altered",
      receiver: "member",
      knownRelayers: both,
      payload: changed(messageRelayedTwice, (e) => (e.relay.entries![1]!.sig = flipChar(e.relay.entries![1]!.sig))),
      error: "RELAY_ENTRY_INVALID",
    },
    {
      name: "acknowledgement with a forged copied journey",
      receiver: "author",
      knownRelayers: both,
      payload: forgedAck.encodedEnvelope,
      error: "RELAY_ENTRY_INVALID",
    },
    {
      name: "acknowledgement's own relay signature altered",
      receiver: "author",
      knownRelayers: both,
      payload: changed(ackRelayedTwice, (e) => (e.relay.entries![1]!.sig = flipChar(e.relay.entries![1]!.sig))),
      error: "RELAY_ENTRY_INVALID",
    },
  ];

  const vectors: RelayGoldenVectors = {
    protocol: "CARRY/1",
    description:
      "Relay entry golden vectors for PACKET_PROTOCOL.md §5, §10 and §11A, generated by scripts/generate-vectors-relay.ts. Keys are test-only. Frozen like carry-v1.json: do not edit or regenerate for protocol v1.",
    generatedAt: T0,
    verifyAt: T0 + 10 * MINUTE,
    keys: { groupKey },
    context: {
      communityId: community.id,
      communityName: community.name,
      keyEpoch: community.keyEpoch,
      adminMemberId: adminIdentity.memberId,
      adminDisplayName: adminIdentity.displayName,
      adminSigningPublicJwk: adminCert.signingPublicJwk,
      acknowledgerMemberId: acknowledgerIdentity.memberId,
      acknowledgerDisplayName: ackCert.displayName,
      acknowledgerSigningPublicJwk: ackCert.signingPublicJwk,
      relayers,
      messageText,
      messageKind: "CHANGE",
      messageJourney: hopsOf(messageRelayedTwice),
      ackJourney: hopsOf(ackRelayedTwice),
    },
    valid: {
      message: message.encodedEnvelope,
      messageRelayedOnce,
      messageRelayedTwice,
      ack: ack.encodedEnvelope,
      ackRelayedOnce,
      ackRelayedTwice,
    },
    invalid,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(vectors, null, 2)}\n`, { flag: "wx" });
}, 60_000);
