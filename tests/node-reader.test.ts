/** How the plugin gets at the filesystem, and what it says when it cannot. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fileReaderFrom } from "../src/core/node-reader.js";

test("there is no reader where there is no require", async () => {
  // Mobile, and anything else without Node. Null is the honest answer, and it
  // is what lets the panel say "no filesystem here" rather than blaming the
  // file it never managed to look at.
  assert.equal(fileReaderFrom(undefined), null);
});

test("a require that cannot resolve fs yields no reader", () => {
  assert.equal(
    fileReaderFrom(() => {
      throw new Error("Cannot find module 'fs'");
    }),
    null,
  );
});

test("a require returning something that is not fs yields no reader", () => {
  assert.equal(fileReaderFrom(() => ({ nope: true })), null);
});

test("it reads through the host's own fs", async () => {
  const reader = fileReaderFrom((id: string) => {
    assert.equal(id, "fs");
    return { promises: { readFile: async (path: string) => `contents of ${path}` } };
  });
  assert.notEqual(reader, null);
  assert.equal(await reader?.("/s.json"), "contents of /s.json");
});

test("a read failure propagates rather than being swallowed", async () => {
  const reader = fileReaderFrom(() => ({
    promises: {
      readFile: async () => {
        throw new Error("ENOENT");
      },
    },
  }));
  await assert.rejects(() => reader?.("/nope") as Promise<string>, /ENOENT/);
});
