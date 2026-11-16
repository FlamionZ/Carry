import { describe, expect, it } from "vitest";
import { canonicalJson, packetAad } from "./canonical";
import { b64uToBytes, bytesToB64u, randomId, utf8Encode } from "./encoding";
import { CarryError } from "./errors";
import { parseCarryPayload } from "./packet/schemas";
import { assertImportable, prepareRelay, shareState } from "./packet/rules";
import { applyFrame, assemblePayload, buildFrames, parseFrame, splitPayload } from "./transfer/frames";

const digest = "A".repeat(43);
const transferId = "B".repeat(16);

describe("encoding", () => {
  it("round-trips Base64URL without padding", () => {
    const bytes = utf8Encode("hello ✓ world");
    const text = bytesToB64u(bytes);
    expect(text).not.toMatch(/[=+/]/);
    expect(b64uToBytes(text)).toEqual(bytes);
  });

  it("rejects non-Base64URL input", () => {
    expect(() => b64uToBytes("abc+")).toThrow();
    expect(() => b64uToBytes("a")).toThrow();
  });

  it("rejects non-canonical encodings with non-zero trailing bits", () => {
    expect(bytesToB64u(new Uint8Array([0]))).toBe("AA");
    expect(() => b64uToBytes("AB")).toThrow();
  });

  it("creates 16-byte ids as 22 chars", () => {
    expect(randomId()).toHaveLength(22);
    expect(randomId(12)).toHaveLength(16);
  });
});

describe("canonical serialization", () => {
  it("sorts keys deterministically at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}',
    );
  });

  it("builds the AAD in the documented field order", () => {
    expect(
      packetAad({
        type: "MESSAGE",
        communityId: "c",
        packetId: "p",
        keyEpoch: 1,
        senderId: "s",
        createdAt: 10,
        expiresAt: 20,
        maxHops: 6,
      }),
    ).toBe("CARRY|1|MESSAGE|c|p|1|s|10|20|6");
  });
});

describe("QR frames", () => {
  it("splits and formats bounded frames", () => {
    const payload = "x".repeat(1000);
    const frames = buildFrames(payload, transferId, digest, 360);
    expect(frames).toHaveLength(3);
    for (const f of frames) expect(f.length).toBeLessThanOrEqual(480);
    expect(frames[0]).toMatch(/^C1:B{16}:0:3:A{43}:x{360}$/);
  });

  it("rejects payloads needing more than 8 frames", () => {
    expect(() => splitPayload("x".repeat(2881))).toThrow(CarryError);
  });

  it.each([
    ["unknown prefix", `C2:${transferId}:0:1:${digest}:abc`],
    ["index out of range", `C1:${transferId}:1:1:${digest}:abc`],
    ["total too large", `C1:${transferId}:0:9:${digest}:abc`],
    ["bad chunk alphabet", `C1:${transferId}:0:1:${digest}:ab+c`],
    ["bad digest", `C1:${transferId}:0:1:short:abc`],
    ["leading zero index", `C1:${transferId}:01:2:${digest}:abc`],
  ])("rejects %s", (_name, text) => {
    expect(() => parseFrame(text)).toThrow(expect.objectContaining({ code: "FRAME_INVALID" }));
  });

  it("reassembles out-of-order frames and treats repeats as idempotent", () => {
    const frames = buildFrames("abcdefghij".repeat(30), transferId, digest, 120).map(parseFrame);
    let state = applyFrame(undefined, frames[2]!, 1).state;
    const dup = applyFrame(state, frames[2]!, 2);
    expect(dup.outcome).toBe("DUPLICATE");
    state = applyFrame(state, frames[0]!, 3).state;
    expect(state.status).toBe("PARTIAL");
    state = applyFrame(state, frames[1]!, 4).state;
    expect(state.status).toBe("COMPLETE");
    expect(assemblePayload(state)).toBe("abcdefghij".repeat(30));
  });

  it("detects conflicting chunk content for the same index", () => {
    const a = parseFrame(`C1:${transferId}:0:2:${digest}:aaaa`);
    const b = parseFrame(`C1:${transferId}:0:2:${digest}:bbbb`);
    const state = applyFrame(undefined, a, 1).state;
    expect(() => applyFrame(state, b, 2)).toThrow(expect.objectContaining({ code: "FRAME_CONFLICT" }));
  });

  it("detects a different digest or total for the same transfer", () => {
    const a = parseFrame(`C1:${transferId}:0:2:${digest}:aaaa`);
    const b = parseFrame(`C1:${transferId}:1:3:${digest}:bbbb`);
    const state = applyFrame(undefined, a, 1).state;
    expect(() => applyFrame(state, b, 2)).toThrow(expect.objectContaining({ code: "FRAME_CONFLICT" }));
  });

  it("refuses to assemble incomplete transfers", () => {
    const a = parseFrame(`C1:${transferId}:0:2:${digest}:aaaa`);
    const state = applyFrame(undefined, a, 1).state;
    expect(() => assemblePayload(state)).toThrow(expect.objectContaining({ code: "TRANSFER_INCOMPLETE" }));
  });
});

describe("payload schema", () => {
  it("rejects unknown major versions before schema checks", () => {
    expect(() => parseCarryPayload({ v: 2, type: "MESSAGE" })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_VERSION" }),
    );
  });

  it("rejects display names with surrounding whitespace or control characters", () => {
    const jwk = { kty: "EC", crv: "P-256", x: "A".repeat(43), y: "A".repeat(43) };
    const invite = {
      v: 1,
      type: "INVITE",
      communityId: "A".repeat(22),
      communityName: "Campus Volunteers",
      inviteId: "A".repeat(22),
      inviteSecret: "A".repeat(22),
      expiresAt: 1,
      adminSigningPublicJwk: jwk,
      adminEphemeralEcdhPublicJwk: jwk,
      adminFingerprint: "ABCD EF01 2345 6789",
    };
    expect(parseCarryPayload(invite)).toMatchObject({ communityName: "Campus Volunteers" });
    for (const communityName of [" Campus", "Campus ", "Cam\u0000pus", ""]) {
      expect(() => parseCarryPayload({ ...invite, communityName })).toThrow(
        expect.objectContaining({ code: "PACKET_SCHEMA_INVALID" }),
      );
    }
  });

  it("rejects unknown types and malformed fields", () => {
    expect(() => parseCarryPayload({ v: 1, type: "FILE" })).toThrow(
      expect.objectContaining({ code: "PACKET_SCHEMA_INVALID" }),
    );
    expect(() => parseCarryPayload({ v: 1, type: "INVITE", communityId: "x" })).toThrow(
      expect.objectContaining({ code: "PACKET_SCHEMA_INVALID" }),
    );
  });
});

describe("relay rules", () => {
  const env = {
    expiresAt: 2000,
    createdAt: 1000,
    maxHops: 2,
    relay: { hopCount: 0 },
  } as Parameters<typeof prepareRelay>[0];

  it("increments only hopCount", () => {
    const relayed = prepareRelay(env, 1500);
    expect(relayed.relay.hopCount).toBe(1);
    expect({ ...relayed, relay: env.relay }).toEqual(env);
  });

  it("reports whether a stored packet can be shown", () => {
    expect(shareState("OUTBOUND", env, 1500)).toBe("OK");
    expect(shareState("INBOUND", env, 1500)).toBe("OK");
    expect(shareState("INBOUND", { ...env, relay: { hopCount: 1 } }, 1500)).toBe("RELAY_LIMIT_REACHED");
    expect(shareState("OUTBOUND", env, 2000)).toBe("EXPIRED");
  });

  it("stops at maxHops and after expiry", () => {
    expect(() => prepareRelay({ ...env, relay: { hopCount: 1 } }, 1500)).toThrow(
      expect.objectContaining({ code: "RELAY_LIMIT_REACHED" }),
    );
    expect(() => prepareRelay(env, 2000)).toThrow(expect.objectContaining({ code: "PACKET_EXPIRED" }));
    expect(() => assertImportable({ ...env, relay: { hopCount: 2 } }, 1500)).toThrow(
      expect.objectContaining({ code: "RELAY_LIMIT_REACHED" }),
    );
  });
});
