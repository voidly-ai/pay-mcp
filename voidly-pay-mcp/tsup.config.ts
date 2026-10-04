import { defineConfig } from "tsup";

// One pass per format: tsup writes metafile-<format>.json, so two ESM
// passes targeting dist race even when their entrypoint names differ.
// Keep both ESM entrypoints together and declarations limited to index.
// The CJS pass emits only the package entrypoint and its declaration.
//
// The ESM output carries a createRequire banner so that any CommonJS-only
// transitive dependency that reaches for `require` at runtime still resolves
// under `"type": "module"`. The published 0.5.1 artifact carried the same
// banner. Nothing in src/ actually calls `require`, so esbuild tree-shakes the
// binding and emits a bare `createRequire(import.meta.url);` — harmless, and
// the escape hatch is there if a dependency ever needs it.

const ESM_REQUIRE_BANNER = [
  "import { createRequire as __vp_cr } from 'module';",
  "const require = __vp_cr(import.meta.url);",
].join("\n");

const shared = {
  target: "node20",
  platform: "node" as const,
  sourcemap: false,
  minify: true,
  metafile: true,
  splitting: false,
  treeshake: true,
  // Everything in `dependencies` stays external; only our own src/ is bundled.
  skipNodeModulesBundle: true,
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts", cli: "src/cli.ts" },
    format: ["esm"],
    dts: { entry: { index: "src/index.ts" } },
    // The build script cleans once before concurrent format passes.
    clean: false,
    outExtension() { return { js: ".js" }; },
    esbuildOptions(options) { options.banner = { js: ESM_REQUIRE_BANNER }; },
  },
  {
    ...shared,
    entry: { index: "src/index.ts" },
    format: ["cjs"],
    dts: { entry: { index: "src/index.ts" } },
    clean: false,
    outExtension() { return { js: ".cjs" }; },
  },
]);
