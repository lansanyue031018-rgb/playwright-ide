import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORY_API_VERSION,
  SERVICE_VERSION
} from "./service-version.mjs";

test("service version advertises the disk history API required by the frontend", () => {
  assert.equal(SERVICE_VERSION, "0.1.2");
  assert.equal(HISTORY_API_VERSION, 1);
});
