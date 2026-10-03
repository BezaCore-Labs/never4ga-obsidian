/** The credential must be findable without ever being stored in the vault. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CredentialError,
  LOCAL_API_CREDENTIAL,
  defaultSecretsPath,
  readCredential,
} from "../src/core/credential.js";

const SECRETS = JSON.stringify({
  version: 1,
  secrets: { [LOCAL_API_CREDENTIAL]: "a-token", "never4ga.connection.x": "other" },
});

test("the default path follows the same XDG rules as platform_paths", () => {
  assert.equal(
    defaultSecretsPath({}, "/home/alex"),
    "/home/alex/.local/state/never4ga/secrets.json",
  );
  assert.equal(
    defaultSecretsPath({ XDG_STATE_HOME: "/var/state" }, "/home/alex"),
    "/var/state/never4ga/secrets.json",
  );
});

test("an empty XDG_STATE_HOME is the same as an unset one", () => {
  // The spec says an empty value is unset. Honouring it literally would look
  // for `/never4ga/secrets.json` at the filesystem root.
  assert.equal(
    defaultSecretsPath({ XDG_STATE_HOME: "  " }, "/home/alex"),
    "/home/alex/.local/state/never4ga/secrets.json",
  );
});

test("it reads the credential the service minted", async () => {
  const value = await readCredential("/s.json", async () => SECRETS);
  assert.equal(value, "a-token");
});

test("a missing file names the path rather than saying 'not paired'", async () => {
  await assert.rejects(
    () => readCredential("/nope.json", async () => { throw new Error("ENOENT"); }),
    (error: unknown) => {
      assert.ok(error instanceof CredentialError);
      assert.match(error.message, /\/nope\.json/);
      assert.match(error.message, /never4ga status/);
      return true;
    },
  );
});

test("a store with no credential says which key is missing", async () => {
  await assert.rejects(
    () => readCredential("/s.json", async () => JSON.stringify({ secrets: {} })),
    (error: unknown) => {
      assert.ok(error instanceof CredentialError);
      assert.match(error.message, new RegExp(LOCAL_API_CREDENTIAL.replace(/\./g, "\\.")));
      return true;
    },
  );
});

test("an unparseable store is not reported as a missing credential", async () => {
  await assert.rejects(
    () => readCredential("/s.json", async () => "{ not json"),
    (error: unknown) => {
      assert.ok(error instanceof CredentialError);
      assert.match(error.message, /not valid JSON/);
      return true;
    },
  );
});
