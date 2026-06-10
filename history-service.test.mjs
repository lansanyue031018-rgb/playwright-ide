import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createHistoryService } from "./history-service.mjs";

function snapshot(label) {
  return {
    steps: [{ id: label, type: "comment", values: { text: label } }]
  };
}

test("workflow snapshots are stored on disk and respect the configured limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-history-"));
  const history = createHistoryService(root, { defaultLimit: 3 });

  await history.record(snapshot("one"));
  await history.record(snapshot("two"));
  await history.record(snapshot("three"));
  await history.record(snapshot("four"));

  const status = await history.getStatus();
  const files = await readdir(path.join(root, ".flow-cache", "snapshots"));

  assert.equal(status.limit, 3);
  assert.equal(status.count, 3);
  assert.equal(status.canUndo, true);
  assert.equal(status.canRedo, false);
  assert.equal(files.filter(file => file.endsWith(".json")).length, 3);
});

test("undo and redo restore snapshots without loading the whole history into the browser", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-history-"));
  const history = createHistoryService(root);

  await history.record(snapshot("one"));
  await history.record(snapshot("two"));
  await history.record(snapshot("three"));

  const undone = await history.undo();
  const redone = await history.redo();

  assert.equal(undone.snapshot.steps[0].id, "two");
  assert.equal(undone.canRedo, true);
  assert.equal(redone.snapshot.steps[0].id, "three");
  assert.equal(redone.canRedo, false);
});

test("recording after undo replaces the abandoned redo branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-history-"));
  const history = createHistoryService(root);

  await history.record(snapshot("one"));
  await history.record(snapshot("two"));
  await history.record(snapshot("three"));
  await history.undo();
  await history.record(snapshot("replacement"));

  const status = await history.getStatus();
  const redo = await history.redo();

  assert.equal(status.count, 3);
  assert.equal(status.canRedo, false);
  assert.equal(redo.snapshot.steps[0].id, "replacement");
});

test("history limit can be changed and trims old snapshots immediately", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-history-"));
  const history = createHistoryService(root, { defaultLimit: 10 });

  await history.record(snapshot("one"));
  await history.record(snapshot("two"));
  await history.record(snapshot("three"));
  const status = await history.updateSettings({ limit: 2 });

  assert.equal(status.limit, 2);
  assert.equal(status.count, 2);
  assert.equal((await history.undo()).snapshot.steps[0].id, "two");
});
