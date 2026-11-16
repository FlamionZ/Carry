import type { Device } from "../application/device";
import { handleScannedText, type ScanOutcome } from "../application/use-cases/scan";
import { buildQrTransfer } from "../application/use-cases/transfer";
import { CarryDb } from "../infrastructure/db/db";

let counter = 0;

/** A simulated phone with its own IndexedDB and controllable clock. */
export function makeDevice(start = Date.UTC(2026, 10, 16, 9, 0, 0)): Device & { advance(ms: number): void } {
  let now = start;
  const db = new CarryDb(`carry-test-${Date.now()}-${counter++}`);
  return {
    db,
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

/** Show a payload as QR frames on one device and scan every frame on another. */
export async function transfer(to: Device, payload: string, chunkSize?: number): Promise<ScanOutcome> {
  const frames = await buildQrTransfer(payload, chunkSize);
  let outcome: ScanOutcome | undefined;
  for (const frame of frames) outcome = await handleScannedText(to, frame);
  return outcome!;
}
