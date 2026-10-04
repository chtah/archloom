import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", browser: "src/browser.ts", cli: "src/cli.ts", "icons/lucide": "src/icons/lucide.ts", "icons/simple-icons": "src/icons/simple-icons.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: true,
  // tsup's declaration worker still sets baseUrl internally; keep this scoped to that worker.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  noExternal: ["@coldtea/pr-lens-schema", "@coldtea/pr-lens-renderer"],
  external: ["zod", "lucide", "simple-icons"],
});
