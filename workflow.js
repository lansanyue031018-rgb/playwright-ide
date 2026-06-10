import { createId } from "./generator.js";

const CONTAINER_TYPES = new Set(["condition", "loop", "task"]);

export function flattenSteps(steps, options = {}) {
  const includeCollapsedChildren = options.includeCollapsedChildren !== false;
  const entries = [];

  function visit(container, depth, parent, branch, parentNumber) {
    container.forEach((step, index) => {
      const number = parentNumber
        ? `${parentNumber}.${index + 1}`
        : String(index + 1);
      entries.push({
        kind: "step",
        id: step.id,
        step,
        container,
        index,
        depth,
        parent,
        branch,
        number,
        firstInBranch: index === 0
      });

      if (step.type === "condition") {
        visit(step.children || [], depth + 1, step, "then", number);
        visitElse(
          step.elseChildren || [],
          depth + 1,
          step,
          number,
          (step.children || []).length
        );
        addEndMarker(step, container, index, depth, parent, branch, number);
      } else if (step.type === "loop" || step.type === "task") {
        const hideChildren =
          step.type === "task" &&
          step.collapsed !== false &&
          !includeCollapsedChildren;
        if (!hideChildren) {
          visit(step.children || [], depth + 1, step, "body", number);
        }
        addEndMarker(step, container, index, depth, parent, branch, number);
      }
    });
  }

  function visitElse(container, depth, parent, parentNumber, offset) {
    container.forEach((step, index) => {
      const number = `${parentNumber}.${offset + index + 1}`;
      entries.push({
        kind: "step",
        id: step.id,
        step,
        container,
        index,
        depth,
        parent,
        branch: "else",
        number,
        firstInBranch: index === 0
      });

      if (step.type === "condition") {
        visit(step.children || [], depth + 1, step, "then", number);
        visitElse(
          step.elseChildren || [],
          depth + 1,
          step,
          number,
          (step.children || []).length
        );
        addEndMarker(step, container, index, depth, parent, "else", number);
      } else if (step.type === "loop" || step.type === "task") {
        const hideChildren =
          step.type === "task" &&
          step.collapsed !== false &&
          !includeCollapsedChildren;
        if (!hideChildren) {
          visit(step.children || [], depth + 1, step, "body", number);
        }
        addEndMarker(step, container, index, depth, parent, "else", number);
      }
    });
  }

  function addEndMarker(owner, container, index, depth, parent, branch, number) {
    entries.push({
      kind: "end",
      id: `end:${owner.id}`,
      owner,
      container,
      index,
      depth,
      parent,
      branch,
      number: `${number}.end`
    });
  }

  visit(steps, 0, null, null, "");
  return entries;
}

export function findFlowEntry(steps, id) {
  return flattenSteps(steps).find(entry => entry.id === id) || null;
}

export function findStepEntry(steps, id) {
  const entry = findFlowEntry(steps, id);
  return entry?.kind === "step" ? entry : null;
}

export function getStepRange(steps, startId, endId) {
  const start = findStepEntry(steps, startId);
  const end = findStepEntry(steps, endId);
  if (!start || !end || start.container !== end.container) return null;

  const first = Math.min(start.index, end.index);
  const last = Math.max(start.index, end.index);
  return start.container.slice(first, last + 1);
}

export function insertStep(steps, selectedId, newStep) {
  const selected = findFlowEntry(steps, selectedId);
  if (!selected) {
    steps.push(newStep);
    return newStep;
  }

  if (selected.kind === "end") {
    selected.container.splice(selected.index + 1, 0, newStep);
    return newStep;
  }

  if (CONTAINER_TYPES.has(selected.step.type)) {
    const branch = selected.step.type === "condition" &&
      selected.step.values.insertBranch === "else"
      ? "elseChildren"
      : "children";
    selected.step[branch] ||= [];
    selected.step[branch].push(newStep);
    return newStep;
  }

  selected.container.splice(selected.index + 1, 0, newStep);
  return newStep;
}

export function moveStep(steps, id, direction) {
  const entry = findStepEntry(steps, id);
  if (!entry) return false;

  const target = entry.index + Math.sign(direction);
  if (target < 0 || target >= entry.container.length) return false;

  [entry.container[entry.index], entry.container[target]] = [
    entry.container[target],
    entry.container[entry.index]
  ];
  return true;
}

export function duplicateStep(steps, id) {
  const entry = findStepEntry(steps, id);
  if (!entry) return null;

  const duplicate = structuredClone(entry.step);
  refreshIds(duplicate);
  entry.container.splice(entry.index + 1, 0, duplicate);
  return duplicate;
}

export function removeStep(steps, id) {
  const entry = findStepEntry(steps, id);
  if (!entry) return null;
  return entry.container.splice(entry.index, 1)[0] || null;
}

function refreshIds(step) {
  step.id = createId();
  for (const child of step.children || []) refreshIds(child);
  for (const child of step.elseChildren || []) refreshIds(child);
}
