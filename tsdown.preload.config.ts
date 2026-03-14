import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/preload/index.ts"],
  format: "cjs",
  outDir: "dist/preload",
  platform: "node",
  deps: {
    neverBundle: ["electron"],
  },
});
