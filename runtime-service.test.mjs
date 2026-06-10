import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeService,
  resolveBrowserUserDataDir
} from "./runtime-service.mjs";

test("legacy default Edge profile is isolated by CDP port", () => {
  assert.match(
    resolveBrowserUserDataDir(
      "http://127.0.0.1:9223",
      "%TEMP%\\vidu-edge-profile"
    ),
    /vidu-edge-profile-9223$/
  );
});

test("Edge profile paths can use an explicit port placeholder", () => {
  assert.match(
    resolveBrowserUserDataDir(
      "http://127.0.0.1:9333",
      "%TEMP%\\edge-{port}"
    ),
    /edge-9333$/
  );
});

test("external scripts are copied under the IDE runtime directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-studio-root-"));
  const external = path.join(
    await mkdtemp(path.join(os.tmpdir(), "flow-studio-source-")),
    "outside.mjs"
  );
  await writeFile(external, 'console.log("outside");\n', "utf8");
  const runtime = createRuntimeService(root);

  const copied = await runtime.copyScript(external);

  assert.equal(copied.relativePath, "runtime/scripts/outside.mjs");
  assert.equal(await readFile(copied.absolutePath, "utf8"), 'console.log("outside");\n');
});

test("current workflow source is written to a stable runtime script", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-studio-root-"));
  const runtime = createRuntimeService(root);

  const script = await runtime.writeCurrentScript(
    'console.log("current");',
    "current workflow.mjs"
  );

  assert.equal(script.relativePath, "runtime/scripts/current-workflow.mjs");
});

test("non JavaScript files cannot be copied for execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-studio-root-"));
  const external = path.join(root, "unsafe.txt");
  await writeFile(external, "text", "utf8");
  const runtime = createRuntimeService(root);

  await assert.rejects(
    runtime.copyScript(external),
    /只允许复制/
  );
});

test("completed modules exit even when they leave active timers behind", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-studio-root-"));
  await writeFile(
    path.join(root, "script-runner.mjs"),
    await readFile(new URL("./script-runner.mjs", import.meta.url), "utf8"),
    "utf8"
  );
  const runtime = createRuntimeService(root);
  const started = await runtime.runScript({
    name: "active-timer.mjs",
    source: `
console.log("module-finished");
setInterval(() => {}, 1000);
`
  });

  const completed = await waitForRun(runtime, started.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.exitCode, 0);
  assert.match(completed.output, /module-finished/);
});

test("running modules can be stopped and are reported as stopped", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-studio-root-"));
  await writeFile(
    path.join(root, "script-runner.mjs"),
    await readFile(new URL("./script-runner.mjs", import.meta.url), "utf8"),
    "utf8"
  );
  const runtime = createRuntimeService(root);
  const started = await runtime.runScript({
    name: "long-running.mjs",
    source: `
console.log("waiting");
await new Promise(resolve => setTimeout(resolve, 30000));
`
  });

  const stopped = await runtime.stopRun(started.id);
  const completed = await waitForRun(runtime, started.id);

  assert.equal(stopped.status, "stopping");
  assert.equal(completed.status, "stopped");
  assert.notEqual(completed.signal, null);
});

async function waitForRun(runtime, id) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const run = runtime.getRun(id);
    if (["completed", "failed", "stopped"].includes(run?.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("run did not exit");
}
