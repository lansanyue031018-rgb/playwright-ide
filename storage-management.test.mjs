import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeService,
  resolveBrowserUserDataDir
} from "./runtime-service.mjs";

test("runtime storage manager lists scripts, tasks, caches, and browser profiles", async () => {
  const root = await mkdtempRoot();
  const runtime = createRuntimeService(root);
  await runtime.writeCurrentScript("console.log('hi')", "current.mjs");
  const task = await runtime.saveTask({ name: "任务 A", mode: "structured", steps: [] });
  await mkdir(path.join(root, ".flow-cache", "snapshots"), { recursive: true });
  await writeFile(path.join(root, ".flow-cache", "snapshots", "1.json"), "{}", "utf8");
  const profileDir = path.join(root, "runtime", "browser-profiles", "account-a-9222");
  await mkdir(profileDir, { recursive: true });
  await writeFile(path.join(profileDir, "Preferences"), "{}", "utf8");

  const storage = await runtime.listStorageItems();

  assert.deepEqual(
    storage.items.map(item => item.type).sort(),
    ["browser-profile", "cache", "script", "task"]
  );
  assert(storage.totalBytes > 0);
  assert.equal(storage.items.find(item => item.type === "task").name, "任务 A");
  assert.match(storage.items.find(item => item.type === "browser-profile").relativePath, /runtime\/browser-profiles\/account-a-9222/);
});

test("runtime storage manager removes safe runtime items by id", async () => {
  const root = await mkdtempRoot();
  const runtime = createRuntimeService(root);
  const script = await runtime.writeCurrentScript("console.log('remove')", "remove-me.mjs");
  await runtime.saveTask({ name: "任务 B", mode: "structured", steps: [] });

  const before = await runtime.listStorageItems();
  const scriptItem = before.items.find(item => item.relativePath === script.relativePath);
  const taskItem = before.items.find(item => item.type === "task");

  assert(scriptItem);
  assert(taskItem);
  await runtime.removeStorageItem(scriptItem.id);
  await runtime.removeStorageItem(taskItem.id);

  const after = await runtime.listStorageItems();
  assert.equal(after.items.some(item => item.id === scriptItem.id), false);
  assert.equal(after.items.some(item => item.id === taskItem.id), false);
});

test("tasks can be updated and deleted", async () => {
  const root = await mkdtempRoot();
  const runtime = createRuntimeService(root);
  const saved = await runtime.saveTask({ name: "旧任务", mode: "structured", steps: [] });

  const updated = await runtime.updateTask(saved.id, {
    name: "新任务",
    mode: "custom",
    template: "await page.locator({{role}}).click();",
    parameters: [
      { key: "role", label: "角色", type: "select", value: "button", options: ["image", "button"] }
    ],
    publishToLibrary: true,
    libraryIcon: "BTN"
  });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.name, "新任务");
  assert.equal(updated.publishToLibrary, true);
  assert.equal(updated.parameters[0].type, "select");

  await runtime.deleteTask(saved.id);
  assert.deepEqual(await runtime.listTasks(), []);
});

test("storage removal rejects paths outside the runtime sandbox", async () => {
  const root = await mkdtempRoot();
  const runtime = createRuntimeService(root);

  await assert.rejects(
    runtime.removeStorageItem("script:../package.json"),
    /不允许删除/
  );
});

async function mkdtempRoot() {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(path.join(os.tmpdir(), "flow-studio-storage-"))
  );
}
