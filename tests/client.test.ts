/** The client is the only thing that talks to the service, so it carries the
 * credential, the loopback base URL, and the API's own error shape. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, Never4gaClient, UnreachableError } from "../src/core/client.js";

function respond(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

test("every request carries the bearer credential", async () => {
  let seen: RequestInit | undefined;
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "a-token",
    fetch: async (_url, init) => {
      seen = init;
      return respond({ status: "ok", version: "0.1", build: "abc" });
    },
  });
  await client.health();
  const headers = seen?.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer a-token");
});

test("a trailing slash on the base URL does not become a double slash", async () => {
  let url = "";
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377/",
    credential: "t",
    fetch: async (seen) => {
      url = seen;
      return respond({ status: "ok", version: "0.1", build: "abc" });
    },
  });
  await client.health();
  assert.equal(url, "http://127.0.0.1:7377/v1/health");
});

test("nothing listening is unreachable, not a failed request", async () => {
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () => { throw new Error("ECONNREFUSED"); },
  });
  await assert.rejects(() => client.health(), UnreachableError);
});

test("the API's structured error survives as a code and a message", async () => {
  // The service wraps every failure as {error: {code, message}}. Reporting
  // the code is what lets a panel say what to do rather than print a number.
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () =>
      respond(
        { error: { code: "index_not_built", message: "this vault has not been indexed yet" } },
        { status: 409 },
      ),
  });
  await assert.rejects(
    () => client.indexStatus(),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "index_not_built");
      assert.equal(error.status, 409);
      assert.match(error.message, /not been indexed/);
      return true;
    },
  );
});

test("an error body that is not JSON still reports the status", async () => {
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () => new Response("<html>502</html>", { status: 502 }),
  });
  await assert.rejects(
    () => client.indexStatus(),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      return true;
    },
  );
});

test("a work item id is escaped into the path and the scope is a query", async () => {
  let url = "";
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (seen) => {
      url = seen;
      return respond({ id: "9/9", title: "t", status: "New" });
    },
  });
  await client.workItem("/home/alex/Projects/lighthouse", "9/9");
  assert.equal(
    url,
    "http://127.0.0.1:7377/v1/work/items/9%2F9?cwd=%2Fhome%2Falex%2FProjects%2Flighthouse",
  );
});

test("work items carry the scope and every requested status", async () => {
  // The route resolves scope from `cwd` exactly as the CLI does; a request
  // that named no directory would have no tracker to ask.
  let url = "";
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (seen) => {
      url = seen;
      return respond({ items: [] });
    },
  });
  await client.workItems("/home/alex/p", { statuses: ["New", "In progress"], limit: 10 });
  assert.match(url, /cwd=%2Fhome%2Falex%2Fp/);
  assert.match(url, /status=New/);
  assert.match(url, /status=In\+progress/);
  assert.match(url, /limit=10/);
});

test("a hung service is abandoned rather than hanging a panel", async () => {
  // Deliberately not `health()`: that has its own shorter ceiling, so calling
  // it here would test the wrong number and sit through the default.
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    timeoutMs: 5,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  await assert.rejects(() => client.indexStatus(), UnreachableError);
});

test("a context request nests cwd under scope", async () => {
  // The request model rejects an unknown top-level key outright, so a `cwd`
  // sent flat is a 422 rather than a pack.
  let body: unknown;
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init.body));
      return respond({ items: [], signals: [] });
    },
  });
  await client.context("deep", { cwd: "/home/alex/p", client: "obsidian" });
  assert.deepEqual(body, { scope: { cwd: "/home/alex/p" }, client: "obsidian" });
});

test("empty terms are omitted rather than sent as an empty list", async () => {
  let body: Record<string, unknown> = {};
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return respond({ items: [], signals: [] });
    },
  });
  await client.context("deep", { cwd: "/home/alex/p", terms: [] });
  assert.equal("terms" in body, false);
});

test("terms are sent when there are any", async () => {
  // `focus` returns an empty pack without them: focused retrieval is lexical
  // and has nothing to match on.
  let body: Record<string, unknown> = {};
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return respond({ items: [], signals: [] });
    },
  });
  await client.context("focus", { cwd: "/home/alex/p", terms: ["wrap", "session"] });
  assert.deepEqual(body["terms"], ["wrap", "session"]);
});

test("health fails fast even when the client is patient", async () => {
  // Presence must answer quickly or the status bar lies by omission, while a
  // search can legitimately take seconds. One timeout cannot serve both, and
  // this guards against health silently inheriting the long one.
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    timeoutMs: 60_000,
    healthTimeoutMs: 5,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  const started = Date.now();
  await assert.rejects(() => client.health(), UnreachableError);
  assert.ok(Date.now() - started < 1_000, "health used the long timeout");
});

test("creating a concept posts the folder as the API's `in`", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (seen, init) => {
      url = seen;
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return respond({ id: "01a0", path: "10_Workspaces/X/Units/Unit-3/rubric.md" });
    },
  });
  await client.createConcept({
    type: "course_assignment",
    title: "Rubric",
    folder: "10_Workspaces/X/Units/Unit-3",
  });
  assert.equal(url, "http://127.0.0.1:7377/v1/concepts");
  assert.equal(body["in"], "10_Workspaces/X/Units/Unit-3");
  assert.equal(body["type"], "course_assignment");
  // Absent means absent: the service must see no key, not an empty string.
  assert.ok(!("description" in body));
});

test("the type registry is read from /v1/schema/types", async () => {
  // The service publishes the registry so a creation surface can offer types
  // instead of a free-text guess; this client call is what the create modal populates
  // its dropdown from.
  let url = "";
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (seen) => {
      url = seen;
      return respond({
        schema_version: "never4ga/0.1",
        required_base_fields: ["type", "id", "schema", "title", "created_at"],
        types: [
          {
            name: "course_assignment",
            locations: ["a workspace's Units/"],
            location_is_binding: true,
            required_fields: ["workspace", "lifecycle"],
            lifecycle_values: ["not_started", "in_progress", "submitted", "graded"],
            optional_fields: [
              { name: "unit", kind: "integer" },
              { name: "due", kind: "date" },
              { name: "grade", kind: null },
            ],
            recommended_authority: null,
            creatable: true,
          },
        ],
      });
    },
  });
  const registry = await client.schemaTypes();
  assert.equal(url, "http://127.0.0.1:7377/v1/schema/types");
  assert.equal(registry.types[0]?.name, "course_assignment");
  assert.deepEqual(registry.types[0]?.optional_fields[2], { name: "grade", kind: null });
});

test("chosen fields ride the create request, and no key rides when none were", async () => {
  // Optional fields and lifecycle both travel inside `fields`; the service
  // converts a declared kind itself, so values are sent as the person typed
  // them. Absent means absent, exactly as `description` already works.
  const bodies: Record<string, unknown>[] = [];
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return respond({ id: "01a0", path: "10_Workspaces/X/Units/Unit-3/rubric.md" });
    },
  });
  await client.createConcept({
    type: "course_assignment",
    title: "Rubric",
    fields: { unit: "1", lifecycle: "in_progress" },
  });
  await client.createConcept({ type: "knowledge", title: "Plain" });
  assert.deepEqual(bodies[0]?.["fields"], { unit: "1", lifecycle: "in_progress" });
  assert.ok(!("fields" in (bodies[1] ?? {})));
});

test("adopting sends the vault-relative path, and a type only when named", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return respond({ id: "01a0", path: "30_Knowledge/Notes/by-hand.md" });
    },
  });
  await client.adoptConcept({ path: "30_Knowledge/Notes/by-hand.md" });
  await client.adoptConcept({ path: "30_Knowledge/Notes/by-hand.md", type: "knowledge" });
  assert.ok(!("type" in (bodies[0] ?? {})));
  assert.equal(bodies[1]?.["type"], "knowledge");
});

test("an adoption that moved the note says where it came from", async () => {
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () =>
      respond({
        id: "01a0",
        path: "30_Knowledge/Notes/raised-beds.md",
        moved_from: "Projects/garden/raised-beds.md",
        placement: "moved out of foreign material into 30_Knowledge/Notes; you named a knowledge",
      }),
  });
  const written = await client.adoptConcept({ path: "Projects/garden/raised-beds.md", type: "knowledge" });
  assert.equal(written.moved_from, "Projects/garden/raised-beds.md");
  assert.equal(written.path, "30_Knowledge/Notes/raised-beds.md");
});

test("an adoption refusal keeps the service's own message and code", async () => {
  // The refusal names the candidate types; the modal shows it verbatim and
  // asks for one. Parsing it would put product knowledge in the plugin.
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () =>
      respond(
        {
          error: {
            code: "concept_not_adopted",
            message: "the folder does not decide -- it could be a resource or a standard",
          },
        },
        { status: 422 },
      ),
  });
  await assert.rejects(
    () => client.adoptConcept({ path: "10_Workspaces/X/Strategy/positioning.md" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "concept_not_adopted");
      assert.match(error.message, /resource or a standard/);
      return true;
    },
  );
});

test("an ambiguity refusal carries its candidate types as data", async () => {
  // The service names no flag -- this surface has none -- so the modal builds
  // its own ask from `details.candidates` rather than parsing the sentence.
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () =>
      respond(
        {
          error: {
            code: "concept_not_adopted",
            message: "the folder does not decide -- it could be a resource or a standard; name which one it is",
            details: { path: "x.md", candidates: ["resource", "standard"] },
          },
        },
        { status: 422 },
      ),
  });
  await assert.rejects(
    () => client.adoptConcept({ path: "x.md" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.deepEqual(error.candidates, ["resource", "standard"]);
      assert.ok(!error.message.includes("--type"));
      return true;
    },
  );
});

test("a refusal with no candidates yields an empty list, not a crash", async () => {
  const client = new Never4gaClient({
    baseUrl: "http://127.0.0.1:7377",
    credential: "t",
    fetch: async () =>
      respond({ error: { code: "concept_not_adopted", message: "no file at x.md" } }, { status: 422 }),
  });
  await assert.rejects(
    () => client.adoptConcept({ path: "x.md" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.deepEqual(error.candidates, []);
      return true;
    },
  );
});
