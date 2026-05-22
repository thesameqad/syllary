import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace packages are published as raw TypeScript (no build step), so they
  // must be bundled into the output — otherwise `node dist/index.js` would try
  // to import .ts at runtime and crash in production.
  noExternal: [/^@syllary\//],
});
