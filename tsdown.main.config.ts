import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main/index.ts"],
  format: "esm",
  outDir: "dist/main",
  platform: "node",
  deps: {
    neverBundle: ["node-pty", "electron"],
  },
});
