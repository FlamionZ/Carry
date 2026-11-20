import { defineConfig } from "vitest/config";
// `npm run vectors` runs only the golden-vector generators. Each one skips
// when its own file exists and never overwrites it:
// src/test/vectors/carry-v1.json (scripts/generate-vectors.ts) and
// src/test/vectors/carry-v1-relay.json (scripts/generate-vectors-relay.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/generate-vectors.ts", "scripts/generate-vectors-relay.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
});
