import { defineConfig } from "vitest/config";

// `npm run vectors` runs only the golden-vector generator. It refuses to
// overwrite src/test/vectors/carry-v1.json; see scripts/generate-vectors.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/generate-vectors.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
});
