import { defineConfig } from "vitest/config";
// The golden-vector generators. Each npm script targets one of them by path:
// `npm run vectors` writes src/test/vectors/carry-v1.json (scripts/generate-vectors.ts),
// `npm run vectors:relay` writes src/test/vectors/carry-v1-relay.json
// (scripts/generate-vectors-relay.ts). Each refuses to overwrite its own file
// and fails with that refusal; the other file is never read or written.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/generate-vectors.ts", "scripts/generate-vectors-relay.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
});
