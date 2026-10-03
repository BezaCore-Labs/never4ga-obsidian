/** Only the newest attempt is allowed to act. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { LatestOnly } from "../src/core/latest-only.js";

test("a lone attempt is current", () => {
  const latest = new LatestOnly();
  assert.equal(latest.begin()(), true);
});

test("a newer attempt supersedes an older one", () => {
  const latest = new LatestOnly();
  const first = latest.begin();
  const second = latest.begin();
  assert.equal(first(), false);
  assert.equal(second(), true);
});

test("the newest stays current however many came before", () => {
  const latest = new LatestOnly();
  const tokens = [latest.begin(), latest.begin(), latest.begin(), latest.begin()];
  assert.deepEqual(
    tokens.map((isCurrent) => isCurrent()),
    [false, false, false, true],
  );
});

test("cancel supersedes without starting anything", () => {
  // Closing the modal must stop a reply that is still on its way from
  // rendering into a panel nobody is looking at.
  const latest = new LatestOnly();
  const attempt = latest.begin();
  latest.cancel();
  assert.equal(attempt(), false);
});

test("a token keeps answering after the fact", () => {
  // The predicate is checked more than once -- after the debounce, and again
  // after the reply -- so it has to stay usable rather than latch.
  const latest = new LatestOnly();
  const attempt = latest.begin();
  assert.equal(attempt(), true);
  assert.equal(attempt(), true);
  latest.begin();
  assert.equal(attempt(), false);
});
