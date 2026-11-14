import { defineConfig } from "tsup";

// Bundle the workspace packages (they ship TypeScript source); keep npm deps external.
export default defineConfig({
  entry: ["src/index.ts", "src/runOnce.ts", "src/migrate.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: [/^@sb\//],
});
