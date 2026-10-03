/** Obsidian's requestUrl, adapted to the shape the client speaks. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchVia } from "../src/core/host-fetch.js";

test("it passes method, headers and body through", async () => {
  let seen: Record<string, unknown> = {};
  const doFetch = fetchVia(async (options) => {
    seen = options as unknown as Record<string, unknown>;
    return { status: 200, headers: {}, text: "{}" };
  });
  await doFetch("http://127.0.0.1:7377/v1/health", {
    method: "POST",
    body: '{"a":1}',
    headers: { authorization: "Bearer t" },
  });
  assert.equal(seen["url"], "http://127.0.0.1:7377/v1/health");
  assert.equal(seen["method"], "POST");
  assert.equal(seen["body"], '{"a":1}');
  assert.deepEqual(seen["headers"], { authorization: "Bearer t" });
});

test("it never lets requestUrl throw on a 4xx", async () => {
  // requestUrl throws on 400+ by default, which would turn every structured
  // API error into an unreachable service and lose the code the panel needs.
  let seen: Record<string, unknown> = {};
  const doFetch = fetchVia(async (options) => {
    seen = options as unknown as Record<string, unknown>;
    return { status: 409, headers: {}, text: '{"error":{"code":"index_not_built"}}' };
  });
  const response = await doFetch("http://127.0.0.1:7377/v1/index/status", { method: "GET" });
  assert.equal(seen["throw"], false);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: { code: "index_not_built" } });
});

test("a status with no body does not become an invalid Response", async () => {
  // `new Response("", {status: 204})` throws. A null-body status has to be
  // constructed with a null body or the adapter fails instead of the request.
  const doFetch = fetchVia(async () => ({ status: 204, headers: {}, text: "" }));
  const response = await doFetch("http://127.0.0.1:7377/x", { method: "GET" });
  assert.equal(response.status, 204);
});

test("an already-aborted request does not reach the host", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const doFetch = fetchVia(async () => {
    called = true;
    return { status: 200, headers: {}, text: "{}" };
  });
  await assert.rejects(() =>
    doFetch("http://127.0.0.1:7377/v1/health", { method: "GET", signal: controller.signal }),
  );
  assert.equal(called, false);
});

test("aborting mid-flight rejects rather than hanging the panel", async () => {
  // requestUrl has no cancellation of its own, so the timeout the client sets
  // would otherwise do nothing at all.
  const controller = new AbortController();
  const doFetch = fetchVia(() => new Promise(() => {}));
  const pending = doFetch("http://127.0.0.1:7377/v1/health", {
    method: "GET",
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(() => pending);
});

test("the host's own failure propagates", async () => {
  const doFetch = fetchVia(async () => {
    throw new Error("ECONNREFUSED");
  });
  await assert.rejects(
    () => doFetch("http://127.0.0.1:7377/v1/health", { method: "GET" }),
    /ECONNREFUSED/,
  );
});
