import { LIMITS } from "../domain/limits";

/** Non-sensitive device preferences. Never store keys or message data here. */
const CHUNK_KEY = "carry.chunkSize";
export const CHUNK_OPTIONS = [360, 300, 240, 180] as const;

export function getChunkSize(): number {
  const value = Number(localStorage.getItem(CHUNK_KEY));
  return (CHUNK_OPTIONS as readonly number[]).includes(value) ? value : LIMITS.maxChunk;
}

export function setChunkSize(value: number): void {
  localStorage.setItem(CHUNK_KEY, String(value));
}

/** Start time for rehearsal measurements (DEMO_PLAN.md §8). 0 = since setup. */
const REHEARSAL_KEY = "carry.rehearsalStart";

export function getRehearsalStart(): number {
  const value = Number(localStorage.getItem(REHEARSAL_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setRehearsalStart(timestamp: number): void {
  localStorage.setItem(REHEARSAL_KEY, String(timestamp));
}
