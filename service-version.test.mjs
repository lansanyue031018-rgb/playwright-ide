import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORY_API_VERSION,
  SERVICE_VERSION
} from "./service-version.mjs";

test("service version advertises the disk history API required by the frontend", () => {
  assert.equal(typeof SERVICE_VERSION, "string");
  assert.match(SERVICE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(HISTORY_API_VERSION, 1);
});
