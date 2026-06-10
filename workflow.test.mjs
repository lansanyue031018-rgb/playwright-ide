import assert from "node:assert/strict";
import test from "node:test";

import { createStep } from "./generator.js";
import {
  duplicateStep,
  findFlowEntry,
  findStepEntry,
  flattenSteps,
  getStepRange,
  insertStep,
  moveStep,
  removeStep
} from "./workflow.js";

test("flattenSteps reports nested branch depth and hierarchical numbers", () => {
  const condition = createStep("condition");
  condition.children.push(createStep("messageAction", { message: "then" }));
  condition.elseChildren.push(createStep("messageAction", { message: "else" }));

  const entries = flattenSteps([condition]);

  assert.deepEqual(entries.map(entry => entry.number), ["1", "1.1", "1.2", "1.end"]);
  assert.deepEqual(entries.map(entry => entry.depth), [0, 1, 1, 0]);
  assert.deepEqual(entries.map(entry => entry.branch), [null, "then", "else", null]);
  assert.equal(entries.at(-1).kind, "end");
});

test("inserting after a selected condition creates a nested branch step", () => {
  const condition = createStep("condition", { insertBranch: "then" });
  const steps = [condition];
  const child = createStep("elementAction", { action: "click" });

  insertStep(steps, condition.id, child);

  assert.equal(condition.children.length, 1);
  assert.equal(condition.children[0].id, child.id);
});

test("nested steps can move, duplicate and delete inside their own branch", () => {
  const condition = createStep("condition");
  const first = createStep("messageAction", { message: "first" });
  const second = createStep("messageAction", { message: "second" });
  condition.children.push(first, second);
  const steps = [condition];

  moveStep(steps, second.id, -1);
  assert.equal(condition.children[0].id, second.id);

  const duplicate = duplicateStep(steps, second.id);
  assert.notEqual(duplicate.id, second.id);
  assert.equal(condition.children[1].id, duplicate.id);

  removeStep(steps, duplicate.id);
  assert.equal(findStepEntry(steps, duplicate.id), null);
});

test("inserting on a block end marker creates a sibling after the block", () => {
  const condition = createStep("condition");
  condition.children.push(createStep("wait"));
  const steps = [condition];
  const next = createStep("messageAction", { message: "next" });
  const marker = flattenSteps(steps).find(entry => entry.kind === "end");

  insertStep(steps, marker.id, next);

  assert.equal(steps.length, 2);
  assert.equal(steps[1].id, next.id);
  assert.equal(findFlowEntry(steps, marker.id).owner.id, condition.id);
});

test("loop and task children are flattened and duplicated recursively", () => {
  const loop = createStep("loop", { loopType: "count", count: 2 });
  const task = createStep("task", { name: "上传主体", mode: "structured" });
  task.children.push(createStep("wait", { milliseconds: 100 }));
  loop.children.push(task);
  const steps = [loop];

  const entries = flattenSteps(steps);
  assert.deepEqual(
    entries.map(entry => entry.kind),
    ["step", "step", "step", "end", "end"]
  );

  const duplicate = duplicateStep(steps, loop.id);
  assert.notEqual(duplicate.id, loop.id);
  assert.notEqual(duplicate.children[0].id, task.id);
  assert.notEqual(duplicate.children[0].children[0].id, task.children[0].id);
});

test("collapsed tasks hide their body only in the visible workflow", () => {
  const task = createStep("task", { name: "上传主体", mode: "existing" });
  task.children.push(createStep("wait", { milliseconds: 100 }));

  assert.equal(task.collapsed, true);
  assert.deepEqual(
    flattenSteps([task], { includeCollapsedChildren: false }).map(entry => entry.kind),
    ["step", "end"]
  );
  assert.deepEqual(
    flattenSteps([task]).map(entry => entry.kind),
    ["step", "step", "end"]
  );
});

test("step ranges include consecutive siblings and reject mixed nesting", () => {
  const first = createStep("wait", { milliseconds: 100 });
  const second = createStep("wait", { milliseconds: 200 });
  const condition = createStep("condition");
  const nested = createStep("messageAction", { message: "nested" });
  condition.children.push(nested);
  const steps = [first, second, condition];

  assert.deepEqual(
    getStepRange(steps, first.id, second.id).map(step => step.id),
    [first.id, second.id]
  );
  assert.equal(getStepRange(steps, second.id, nested.id), null);
});
