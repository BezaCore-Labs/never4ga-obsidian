/** What the create modal sends as `fields`, from what the person chose. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { booleanChoice, conceptFields } from "../src/core/concept-fields.js";

test("a boolean chosen as true is sent as a real boolean", () => {
  // The choice is already the value, so it is sent as one rather than as the
  // word for it.
  assert.deepEqual(conceptFields({ required_reading: booleanChoice("true") }, ""), {
    required_reading: true,
  });
});

test("a boolean chosen as false is sent, not dropped as empty", () => {
  assert.deepEqual(conceptFields({ required_reading: booleanChoice("false") }, ""), {
    required_reading: false,
  });
});

test("an unset boolean sends nothing", () => {
  assert.deepEqual(conceptFields({ required_reading: booleanChoice("") }, ""), {});
});

test("typed text is trimmed and sent as typed, and blank text is not sent", () => {
  // A declared kind other than boolean is the service's to convert.
  assert.deepEqual(conceptFields({ unit: " 3 ", grade: "  " }, ""), { unit: "3" });
});

test("a chosen lifecycle is sent with the fields", () => {
  assert.deepEqual(conceptFields({ required_reading: true }, "active"), {
    required_reading: true,
    lifecycle: "active",
  });
});

test("only the three dropdown values are choices", () => {
  assert.equal(booleanChoice("true"), true);
  assert.equal(booleanChoice("false"), false);
  assert.equal(booleanChoice(""), undefined);
  assert.equal(booleanChoice("yes"), undefined);
});
