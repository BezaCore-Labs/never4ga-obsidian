/**
 * Reaching the filesystem from inside Obsidian.
 *
 * The desktop app is Electron with Node available, and the way a plugin gets
 * at it is the host's ambient `require` — *not* `await import("node:fs")`,
 * which esbuild leaves as a dynamic import and Electron then routes through
 * the browser module loader, where it fails with "Failed to fetch dynamically
 * imported module". Reported as an unreadable secret store, that failure
 * would send the reader to look at a file that was never the problem.
 *
 * It is resolved lazily, and never at module load. A top-level `require("fs")`
 * would throw on mobile before the plugin finished loading, which is the
 * opposite of degrading honestly: the panel that exists to say "no service
 * here" would be the thing that failed to appear.
 */

import type { FileReader } from "./credential.js";

/** Electron's ambient `require`, where there is one. */
export type NodeRequire = (id: string) => unknown;

interface FsModule {
  promises: { readFile: (path: string, encoding: string) => Promise<string> };
}

/**
 * A reader backed by the host's `fs`, or `null` where there is no filesystem.
 *
 * Null is a platform fact rather than an error, and keeping the two apart is
 * the whole point: "there is no filesystem here" and "that file would not
 * open" have different fixes, and only one of them is about the secret store.
 */
export function fileReaderFrom(ambient: NodeRequire | undefined): FileReader | null {
  if (typeof ambient !== "function") {
    return null;
  }
  let module: unknown;
  try {
    module = ambient("fs");
  } catch {
    return null;
  }
  if (!isFsModule(module)) {
    return null;
  }
  const fs = module;
  return (path: string) => fs.promises.readFile(path, "utf-8");
}

function isFsModule(value: unknown): value is FsModule {
  const candidate = value as FsModule | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.promises?.readFile === "function"
  );
}
