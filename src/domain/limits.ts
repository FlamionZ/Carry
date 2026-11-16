/** MVP protocol and product limits (PACKET_PROTOCOL.md §3, PRD scope). */
export const LIMITS = {
  maxFrameText: 480,
  maxChunk: 360,
  minChunk: 120,
  maxFrames: 8,
  maxPayload: 2880,
  maxPartialTransfers: 16,
  maxNameLength: 40,
  maxMessageLength: 280,
  maxHopsDefault: 6,
  maxHopsLimit: 16,
} as const;

export const DURATIONS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  inviteTtl: 15 * 60_000,
  joinRequestTtl: 60 * 60_000,
  messageTtl: 24 * 3_600_000,
  transferRetention: 24 * 3_600_000,
  tombstoneWindow: 30 * 86_400_000,
  inviteRetention: 30 * 86_400_000,
} as const;
