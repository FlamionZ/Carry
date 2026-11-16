import type { CarryDb } from "../infrastructure/db/db";

/** Injectable clock so expiry rules are testable. Returns Unix epoch ms. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** Everything a use case needs: the local store and a clock. */
export interface Device {
  db: CarryDb;
  now: Clock;
}
