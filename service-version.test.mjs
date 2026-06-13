import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HISTORY_API_VERSION,
  SERVICE_VERSION
} from "./service-version.mjs";

test("service version advertises the disk history API required by the frontend", () => {
  assert.equal(SERVICE_VERSION, "0.1.4");
  assert.equal(HISTORY_API_VERSION, 1);
});

test("Windows launcher requires the same service version as the frontend", async () => {
  const launcher = await readFile(new URL("./start-flow-studio.ps1", import.meta.url), "utf8");

  assert.match(launcher, new RegExp(`\\$RequiredServiceVersion = "${SERVICE_VERSION}"`));
});
