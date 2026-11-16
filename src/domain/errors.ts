/** Protocol error codes from PACKET_PROTOCOL.md §13. */
export const PROTOCOL_ERROR_CODES = [
  "FRAME_INVALID",
  "FRAME_CONFLICT",
  "TRANSFER_INCOMPLETE",
  "TRANSFER_DIGEST_MISMATCH",
  "PACKET_SCHEMA_INVALID",
  "UNSUPPORTED_VERSION",
  "UNKNOWN_COMMUNITY",
  "INVITE_EXPIRED",
  "INVITE_ALREADY_USED",
  "JOIN_APPROVAL_INVALID",
  "CERTIFICATE_INVALID",
  "SIGNATURE_INVALID",
  "KEY_EPOCH_MISMATCH",
  "DECRYPTION_FAILED",
  "PACKET_EXPIRED",
  "PACKET_DUPLICATE",
  "RELAY_LIMIT_REACHED",
] as const;

/** Local application errors that are not part of the wire protocol. */
export const APP_ERROR_CODES = [
  "IDENTITY_MISSING",
  "NOT_ADMIN",
  "ALREADY_MEMBER",
  "JOIN_REQUEST_INVALID",
  "PAYLOAD_TOO_LARGE",
  "INPUT_INVALID",
  "STORAGE_ERROR",
  "NOT_FOUND",
  "INSECURE_CONTEXT",
] as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
export type CarryErrorCode = ProtocolErrorCode | AppErrorCode;

const MESSAGES: Record<CarryErrorCode, string> = {
  FRAME_INVALID: "This QR code is not a valid CARRY frame.",
  FRAME_CONFLICT: "This frame conflicts with frames already scanned for the same transfer.",
  TRANSFER_INCOMPLETE: "Some QR frames are still missing.",
  TRANSFER_DIGEST_MISMATCH: "The scanned frames do not match their checksum. The transfer was discarded.",
  PACKET_SCHEMA_INVALID: "The packet format is not valid.",
  UNSUPPORTED_VERSION: "This packet uses a protocol version this app does not support.",
  UNKNOWN_COMMUNITY: "This device is not a member of that community.",
  INVITE_EXPIRED: "This invitation has expired.",
  INVITE_ALREADY_USED: "This invitation has already been used.",
  JOIN_APPROVAL_INVALID: "This join approval could not be verified for this device.",
  CERTIFICATE_INVALID: "The sender's membership certificate is not valid for this community.",
  SIGNATURE_INVALID: "The packet signature is not valid. Content was not shown.",
  KEY_EPOCH_MISMATCH: "This packet uses a community key this device does not have.",
  DECRYPTION_FAILED: "The packet could not be decrypted. Content was not shown.",
  PACKET_EXPIRED: "This packet has expired and can no longer be imported or relayed.",
  PACKET_DUPLICATE: "This packet is already on this device.",
  RELAY_LIMIT_REACHED: "This packet has reached its relay limit.",
  IDENTITY_MISSING: "Set up this device's display name first.",
  NOT_ADMIN: "Only the community administrator can do this.",
  ALREADY_MEMBER: "This device is already in that community.",
  JOIN_REQUEST_INVALID: "This join request is not valid.",
  PAYLOAD_TOO_LARGE: "This message is too long to carry by QR. Shorten it and try again.",
  INPUT_INVALID: "Please check the entered values.",
  STORAGE_ERROR: "Local storage is unavailable or full. No changes were saved.",
  NOT_FOUND: "That item was not found on this device.",
  INSECURE_CONTEXT: "CARRY needs a secure connection (HTTPS or localhost) for encryption, the camera and offline mode.",
};

export class CarryError extends Error {
  readonly code: CarryErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: CarryErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? MESSAGES[code]);
    this.name = "CarryError";
    this.code = code;
    this.details = details;
  }
}

export function isCarryError(err: unknown, code?: CarryErrorCode): err is CarryError {
  return err instanceof CarryError && (code === undefined || err.code === code);
}

/** IndexedDB / Dexie error names that mean local storage could not be used. */
const STORAGE_ERROR_NAMES = new Set([
  "QuotaExceededError",
  "DatabaseClosedError",
  "OpenFailedError",
  "MissingAPIError",
  "InvalidStateError",
  "TransactionInactiveError",
  "ReadOnlyError",
  "VersionError",
  "DataCloneError",
  "UnknownError",
]);

export function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof CarryError) return { code: err.code, message: err.message };
  if (err instanceof Error && STORAGE_ERROR_NAMES.has(err.name)) {
    return { code: "STORAGE_ERROR", message: MESSAGES.STORAGE_ERROR };
  }
  return { code: "UNEXPECTED", message: "Something went wrong. Please try again." };
}
