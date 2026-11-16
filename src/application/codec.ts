import { canonicalJson } from "../domain/canonical";
import { b64uToBytes, bytesToB64u, utf8Decode, utf8Encode } from "../domain/encoding";
import { CarryError } from "../domain/errors";
import { LIMITS } from "../domain/limits";
import { type CarryPayload, parseCarryPayload } from "../domain/packet/schemas";

/** Canonical UTF-8 JSON → Base64URL payload for QR transfer. */
export function encodePayload(value: CarryPayload): string {
  const payload = bytesToB64u(utf8Encode(canonicalJson(value)));
  if (payload.length > LIMITS.maxPayload) throw new CarryError("PAYLOAD_TOO_LARGE");
  return payload;
}

/** Decode + validate an untrusted Base64URL payload. */
export function decodePayload(payload: string): CarryPayload {
  if (payload.length > LIMITS.maxPayload) throw new CarryError("PACKET_SCHEMA_INVALID");
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(b64uToBytes(payload)));
  } catch {
    throw new CarryError("PACKET_SCHEMA_INVALID");
  }
  return parseCarryPayload(parsed);
}
