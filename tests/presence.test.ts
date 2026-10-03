/** Presence has five values because the honest answer to "is it there" does. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Never4gaClient } from "../src/core/client.js";
import { probe, summarise } from "../src/core/presence.js";

function client(fetch: ConstructorParameters<typeof Never4gaClient>[0]["fetch"]): Never4gaClient {
  return new Never4gaClient({ baseUrl: "http://127.0.0.1:7377", credential: "t", fetch });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("nothing listening is absent, and says the vault is still fine", async () => {
  const presence = await probe(client(async () => { throw new Error("ECONNREFUSED"); }));
  assert.equal(presence.state, "absent");
  assert.match(presence.detail, /still a plain Markdown vault/);
  assert.equal(summarise(presence), "Never4gA: off");
});

test("a rejected credential is unpaired rather than absent", async () => {
  // The difference matters: one is fixed by starting the service, the other by
  // re-reading the secret store, and conflating them sends the user to the
  // wrong place.
  const presence = await probe(client(async () => json({ error: { message: "no" } }, 401)));
  assert.equal(presence.state, "unpaired");
});

test("something listening but not healthy yet is starting", async () => {
  const presence = await probe(client(async () => json({ error: { message: "warming" } }, 503)));
  assert.equal(presence.state, "starting");
});

test("a healthy service is answering and names its build", async () => {
  const presence = await probe(
    client(async () => json({ status: "ok", version: "0.1", build: "6814f6852661" })),
  );
  assert.equal(presence.state, "answering");
  assert.match(presence.detail, /6814f6852661/);
});

test("a service on a different build is mismatched, not healthy", async () => {
  // The stale-daemon case. It answers, and it answers wrongly -- which is
  // worse than not answering, and is why Never4gA fingerprints its source.
  const presence = await probe(
    client(async () => json({ status: "ok", version: "0.1", build: "22d3170a8f87" })),
    "6814f6852661",
  );
  assert.equal(presence.state, "mismatched");
  assert.match(presence.detail, /service restart/);
  assert.equal(summarise(presence), "Never4gA: stale build");
});

test("no expected build means a build cannot be mismatched", async () => {
  const presence = await probe(
    client(async () => json({ status: "ok", version: "0.1", build: "anything" })),
  );
  assert.equal(presence.state, "answering");
});
