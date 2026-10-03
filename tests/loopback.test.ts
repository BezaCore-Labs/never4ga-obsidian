/**
 * The credential is sent only to a loopback address.
 *
 * The service address is a setting stored inside the vault, so anyone who can
 * change the vault's files can change it. The local API credential goes with
 * every request, so an address that leaves the machine would hand it over.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loopbackProblem } from "../src/core/loopback.js";

test("the loopback addresses are accepted", () => {
  for (const address of [
    "http://127.0.0.1:7377",
    "http://127.0.0.2:8000",
    "http://localhost:7377",
    "http://[::1]:7377",
    "https://localhost",
  ]) {
    assert.equal(loopbackProblem(address), null, address);
  }
});

test("an address that leaves the machine is refused, and says so", () => {
  for (const address of [
    "http://192.168.1.20:7377",
    "https://example.com",
    "http://localhost.example.com:7377",
    "http://127.0.0.1.example.com",
  ]) {
    assert.match(loopbackProblem(address) ?? "", /not a loopback address/, address);
  }
});

test("an address that is not a URL is refused", () => {
  assert.match(loopbackProblem("127.0.0.1:7377") ?? "", /not a valid address/);
  assert.match(loopbackProblem("ftp://127.0.0.1") ?? "", /http/);
});
