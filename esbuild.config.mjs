/**
 * Obsidian wants one `main.js` beside `manifest.json`, so the build is a
 * single bundle with the host's own modules left external. No framework: a
 * view that renders a dozen rows does not need a runtime to do it.
 */
import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Everything Obsidian provides at runtime. Bundling any of it would ship a
  // second copy of the host's own code inside the plugin.
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    // Both spellings: `builtin-modules` lists bare names, and `node:fs` is a
    // separate specifier esbuild will not resolve without being told.
    ...builtins,
    ...builtins.map((name) => `node:${name}`),
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
