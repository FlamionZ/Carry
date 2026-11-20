import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits";
import { applyFrame, assemblePayload, buildFrames, parseFrame, type TransferState } from "./transfer/frames";

const B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const digest = "D".repeat(43);
const transferId = "T".repeat(16);

/** A Base64URL payload and a chunk size that together fit the frame limits. */
const payloadAndChunk = fc
  .integer({ min: LIMITS.minChunk, max: LIMITS.maxChunk })
  .chain((chunkSize) =>
    fc.record({
      chunkSize: fc.constant(chunkSize),
      payload: fc.string({
        unit: fc.constantFrom(...B64U),
        minLength: 1,
        maxLength: chunkSize * LIMITS.maxFrames,
      }),
    }),
  );

/** Scans frames in the given order, as a receiving device would. */
function scan(frames: string[]): { state: TransferState; outcomes: string[] } {
  let state: TransferState | undefined;
  const outcomes: string[] = [];
  for (const text of frames) {
    const applied = applyFrame(state, parseFrame(text), 0);
    state = applied.state;
    outcomes.push(applied.outcome);
  }
  return { state: state!, outcomes };
}

describe("frame reassembly properties", () => {
  it("any order of a packet's frames reassembles the identical payload", () => {
    fc.assert(
      fc.property(
        payloadAndChunk.chain(({ payload, chunkSize }) => {
          const frames = buildFrames(payload, transferId, digest, chunkSize);
          return fc.record({
            payload: fc.constant(payload),
            order: fc.shuffledSubarray(frames, { minLength: frames.length, maxLength: frames.length }),
          });
        }),
        ({ payload, order }) => {
          const { state } = scan(order);
          expect(state.status).toBe("COMPLETE");
          expect(assemblePayload(state)).toBe(payload);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("duplicate frames inserted anywhere never change the result", () => {
    fc.assert(
      fc.property(
        payloadAndChunk.chain(({ payload, chunkSize }) => {
          const frames = buildFrames(payload, transferId, digest, chunkSize);
          return fc.record({
            payload: fc.constant(payload),
            order: fc.shuffledSubarray(frames, { minLength: frames.length, maxLength: frames.length }),
            // Each repeat: which frame to scan again, and where in the scan sequence.
            repeats: fc.array(fc.tuple(fc.nat({ max: frames.length - 1 }), fc.nat()), { maxLength: 20 }),
          });
        }),
        ({ payload, order, repeats }) => {
          const sequence = [...order];
          for (const [frame, at] of repeats) sequence.splice(at % (sequence.length + 1), 0, order[frame]!);

          const { state, outcomes } = scan(sequence);
          expect(state.status).toBe("COMPLETE");
          expect(assemblePayload(state)).toBe(payload);
          expect(outcomes.filter((o) => o === "NEW")).toHaveLength(order.length);
          expect(outcomes.filter((o) => o === "DUPLICATE")).toHaveLength(repeats.length);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
