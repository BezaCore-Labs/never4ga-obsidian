/** A note in foreign material reaches search and packs with no id and no type. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdopted, kindOf, NOT_ADOPTED } from "../src/core/foreign.js";

test("a concept is adopted", () => {
  assert.equal(isAdopted({ id: "01a0c1ee-4a0a-73c6-bafc-e8343e9b159a" }), true);
});

test("a note reached by path alone is not adopted", () => {
  assert.equal(isAdopted({ id: null }), false);
});

test("a concept is described by its type", () => {
  assert.equal(kindOf({ id: "01a0c1ee-4a0a-73c6-bafc-e8343e9b159a", type: "knowledge" }), "knowledge");
});

test("a foreign note is described as not adopted, never as null", () => {
  assert.equal(kindOf({ id: null, type: null }), NOT_ADOPTED);
  assert.equal(NOT_ADOPTED, "not adopted");
});
