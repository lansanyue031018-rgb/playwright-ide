import {
  STEP_DEFINITIONS,
  createId,
  createStep,
  createViduTemplate,
  getAdvancedCode,
  generateMjs,
  summarizeStep
} from "./generator.js";
import {
  finalizeParameterizedTemplate,
  normalizeSteps,
  parameterizeCode,
  parseMjs
} from "./parser.js";
import {
  duplicateStep,
  findFlowEntry,
  findPreferredStep,
  findStepEntry,
  flattenSteps,
  getStepRange,
  insertStep,
  moveStep,
  removeStep
} from "./workflow.js";
import {
  HISTORY_API_VERSION,
  SERVICE_VERSION
} from "./service-version.mjs";

const STORAGE_KEY = "playwright-flow-studio:v3";
const PREVIOUS_STORAGE_KEY = "playwright-flow-studio:v2";
const LEGACY_STORAGE_KEY = "playwright-flow-studio:v1";

const elements = {
  stepLibrary: document.querySelector("#stepLibrary"),
  flowList: document.querySelector("#flowList"),
  flowEmpty: document.querySelector("#flowEmpty"),
  inspectorForm: document.querySelector("#inspectorForm"),
  inspectorEmpty: document.querySelector("#inspectorEmpty"),
  codePreview: document.querySelector("#codePreview"),
  toast: document.querySelector("#toast"),
  mjsFileInput: document.querySelector("#mjsFileInput"),
  jsonFileInput: document.querySelector("#jsonFileInput"),
  externalScriptPath: document.querySelector("#externalScriptPath"),
  taskModulePath: document.querySelector("#taskModulePath"),
  taskRangeDialog: document.querySelector("#taskRangeDialog"),
  taskRangeForm: document.querySelector("#taskRangeForm"),
  taskRangeName: document.querySelector("#taskRangeName"),
  taskRangeStart: document.querySelector("#taskRangeStart"),
  taskRangeEnd: document.querySelector("#taskRangeEnd"),
  customModuleDialog: document.querySelector("#customModuleDialog"),
  customModuleForm: document.querySelector("#customModuleForm"),
  customModuleName: document.querySelector("#customModuleName"),
  customModuleParameters: document.querySelector("#customModuleParameters"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  historyLimit: document.querySelector("#historyLimit"),
  historySummary: document.querySelector("#historySummary"),
  undoFlow: document.querySelector("#undoFlow"),
  redoFlow: document.querySelector("#redoFlow"),
  stopCurrentRun: document.querySelector("#stopCurrentRun"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  runOutput: document.querySelector("#runOutput")
};

let state = loadState();
let toastTimer;
let runPollTimer;
let historyTimer;
let historyQueue = Promise.resolve();
let historyStatus = {
  limit: 50,
  count: 0,
  index: -1,
  canUndo: false,
  canRedo: false
};
let currentRunId = null;
let taskRegistry = [];
let taskRangeEntries = [];
let customModuleDraft = null;

renderLibrary();
render();
bindToolbar();
initializeRuntime();

function renderLibrary() {
  elements.stepLibrary.replaceChildren(
    ...Object.entries(STEP_DEFINITIONS)
      .filter(([, definition]) => definition.library !== false)
      .map(([type, definition]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "library-step";
        button.innerHTML = `
          <span class="step-icon">${escapeHtml(definition.icon)}</span>
          <span>
            <strong>${escapeHtml(definition.label)}</strong>
            <small>${escapeHtml(definition.description)}</small>
          </span>
        `;
        button.addEventListener("click", () => addStep(type));
        return button;
      })
  );
}

function render() {
  if (state.selectedId && !findFlowEntry(state.steps, state.selectedId)) {
    state.selectedId = flattenSteps(state.steps)[0]?.id ?? null;
  }

  renderFlow();
  renderInspector();
  elements.codePreview.textContent = generateMjs(state.steps);
  saveState();
  renderHistoryStatus();
}

function renderMutation() {
  render();
  clearTimeout(historyTimer);
  historyTimer = null;
  recordHistorySnapshot();
}

function renderFlow() {
  const entries = flattenSteps(state.steps, {
    includeCollapsedChildren: false
  });
  elements.flowEmpty.hidden = entries.length > 0;
  elements.flowList.hidden = entries.length === 0;

  elements.flowList.replaceChildren(
    ...entries.map(entry => {
      if (entry.kind === "end") return createEndMarker(entry);
      const { step } = entry;
      const definition = STEP_DEFINITIONS[step.type];
      const displayLabel = step.type === "templateCode"
        ? step.values.category || step.values.title || definition?.label
        : definition?.label;
      const item = document.createElement("li");
      item.className = [
        "flow-card",
        entry.id === state.selectedId ? "selected" : "",
        entry.depth ? "nested" : "",
        step.enabled === false ? "disabled-step" : ""
      ].filter(Boolean).join(" ");
      item.dataset.id = step.id;
      item.style.setProperty("--flow-depth", String(entry.depth));

      const branchBadge = entry.branch && entry.firstInBranch
        ? `<span class="branch-badge">${
            entry.branch === "then"
              ? "条件成立"
              : entry.branch === "else"
                ? "否则"
                : "代码块内容"
          }</span>`
        : "";
      const childButton = (
        ["condition", "loop"].includes(step.type) ||
        (step.type === "task" && step.collapsed === false)
      )
        ? '<button type="button" class="icon-button" data-action="child" title="选择此分支并从左侧插入子步骤">＋</button>'
        : "";
      const collapseButton = step.type === "task"
        ? `<button type="button" class="icon-button" data-action="toggle-collapse" title="${step.collapsed === false ? "收起任务" : "展开任务"}">${step.collapsed === false ? "⌃" : "⌄"}</button>`
        : "";
      const enabledButton = `
        <button
          type="button"
          class="icon-button visibility-button"
          data-action="toggle-enabled"
          title="${step.enabled === false ? "启用步骤" : "停用步骤"}"
          aria-label="${step.enabled === false ? "启用步骤" : "停用步骤"}"
          aria-pressed="${step.enabled !== false}"
        ><span class="eye-icon" aria-hidden="true"></span></button>
      `;

      item.innerHTML = `
        ${branchBadge}
        <span class="step-number">${escapeHtml(entry.number)}</span>
        <span class="flow-summary">
          <strong>${escapeHtml(displayLabel ?? step.type)}</strong>
          <span>${escapeHtml(summarizeStep(step) || "尚未配置")}</span>
        </span>
        <span class="flow-controls">
          ${enabledButton}
          ${collapseButton}
          ${childButton}
          <button type="button" class="icon-button" data-action="up" title="上移">↑</button>
          <button type="button" class="icon-button" data-action="down" title="下移">↓</button>
          <button type="button" class="icon-button" data-action="duplicate" title="复制">⧉</button>
          <button type="button" class="icon-button delete" data-action="delete" title="删除">×</button>
        </span>
      `;

      item.addEventListener("click", event => {
        const action = event.target.closest("button")?.dataset.action;
        if (action) {
          event.stopPropagation();
          runStepAction(action, step.id);
          return;
        }

        state.selectedId = step.id;
        render();
      });

      return item;
    })
  );
}

function createEndMarker(entry) {
  const item = document.createElement("li");
  const label = {
    condition: "条件分支结束",
    loop: "循环结束",
    task: "任务结束"
  }[entry.owner.type] || "步骤组结束";
  item.className = [
    "flow-card",
    "end-marker",
    entry.id === state.selectedId ? "selected" : ""
  ].filter(Boolean).join(" ");
  item.dataset.id = entry.id;
  item.style.setProperty("--flow-depth", String(entry.depth));
  item.innerHTML = `
    <span class="step-number">END</span>
    <span class="flow-summary">
      <strong>${escapeHtml(label)}</strong>
      <span>选中后，新步骤会插入到整个代码块之后</span>
    </span>
  `;
  item.addEventListener("click", () => {
    state.selectedId = entry.id;
    render();
  });
  return item;
}

function renderInspector() {
  const flowEntry = findFlowEntry(state.steps, state.selectedId);
  if (flowEntry?.kind === "end") {
    elements.inspectorEmpty.hidden = true;
    elements.inspectorForm.hidden = false;
    const note = document.createElement("div");
    note.className = "condition-help";
    note.textContent = "这是无执行代码的结束标志。保持选中并从左侧插入操作，新步骤会放在整个条件、循环或任务之后。";
    elements.inspectorForm.replaceChildren(note);
    return;
  }
  const step = selectedStep();
  elements.inspectorEmpty.hidden = Boolean(step);
  elements.inspectorForm.hidden = !step;

  if (!step) {
    elements.inspectorForm.replaceChildren();
    return;
  }

  const definition = STEP_DEFINITIONS[step.type];
  const title = document.createElement("div");
  title.className = "field";
  title.innerHTML = `
    <label>步骤类型</label>
    <input value="${escapeAttribute(definition.label)}" disabled>
  `;

  const extra = [];
  if (["condition", "loop", "task"].includes(step.type)) {
    const help = document.createElement("p");
    help.className = "condition-help";
    help.textContent = step.type === "condition"
      ? "选中此条件后，新操作会成为缩进子步骤；选中结束标志后，新操作会放到条件块之后。"
      : `选中此${step.type === "loop" ? "循环" : "任务"}后，新操作会进入代码块；选中结束标志后会插到块外。`;
    extra.push(help);
  }
  if (step.type === "custom") {
    extra.push(createCustomModuleAction());
  }

  elements.inspectorForm.replaceChildren(
    title,
    ...definition.fields
      .filter(field => isFieldVisible(field, step.values))
      .map(field => createField(step, field)),
    ...extra,
    ...createParameterFields(step),
    ...(supportsAdvancedPanel(step) ? [createAdvancedPanel(step)] : [])
  );

  elements.inspectorForm.oninput = updateSelectedStep;
  elements.inspectorForm.onchange = updateSelectedStep;
}

function supportsAdvancedPanel(step) {
  return !["comment", "custom", "messageAction"].includes(step.type);
}

function isFieldVisible(field, values) {
  if (field.showWhen) {
    const visible = Object.entries(field.showWhen).every(
      ([key, allowed]) => allowed.includes(String(values[key]))
    );
    if (!visible) return false;
  }

  if (field.hideWhen) {
    const hidden = Object.entries(field.hideWhen).some(
      ([key, blocked]) => blocked.includes(String(values[key]))
    );
    if (hidden) return false;
  }

  return true;
}

function createField(step, field) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const label = document.createElement("label");
  label.textContent = field.label;
  let control;

  if (["task-select", "custom-module-select"].includes(field.type)) {
    control = document.createElement("select");
    const customModules = field.type === "custom-module-select";
    const records = taskRegistry.filter(task =>
      customModules ? task.mode === "custom" : task.mode !== "custom"
    );
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = records.length
      ? customModules ? "请选择自定义模块" : "请选择现有任务"
      : customModules ? "暂无自定义模块" : "暂无现有任务";
    control.append(placeholder);
    records.forEach(task => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = customModules
        ? task.name
        : `${task.name} · ${task.mode === "module" ? "MJS 模块" : "步骤组"}`;
      option.selected = String(step.values[field.key] || "") === String(task.id);
      control.append(option);
    });
    control.disabled = records.length === 0;
  } else if (field.type === "select") {
    control = document.createElement("select");
    field.options.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = String(step.values[field.key]) === String(value);
      control.append(option);
    });
  } else if (field.type === "textarea") {
    control = document.createElement("textarea");
    control.value = step.values[field.key] ?? "";
  } else if (field.type === "checkbox") {
    wrapper.className = "checkbox-field";
    control = document.createElement("input");
    control.type = "checkbox";
    control.checked = Boolean(step.values[field.key]);
  } else {
    control = document.createElement("input");
    control.type = field.type;
    control.value = step.values[field.key] ?? "";
  }

  control.dataset.field = field.key;
  if (field.type === "checkbox") wrapper.append(control, label);
  else wrapper.append(label, control);
  return wrapper;
}

function createParameterFields(step) {
  if (!["templateCode", "customModule"].includes(step.type)) return [];

  const parameters = step.values.parameters || [];
  if (!parameters.length) {
    const empty = document.createElement("p");
    empty.className = "field-help";
    empty.textContent = step.type === "customModule"
      ? "该自定义模块没有可配置参数。"
      : "该高级代码步骤没有可自动提取的基础参数。";
    return [empty];
  }

  return parameters.map((parameter, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    label.textContent = parameter.label;
    let control;

    if (parameter.type === "boolean") {
      wrapper.className = "checkbox-field";
      control = document.createElement("input");
      control.type = "checkbox";
      control.checked = parameter.value === true || parameter.value === "true";
    } else {
      control = document.createElement("input");
      control.type = parameter.type === "number" ? "number" : "text";
      control.value = parameter.value ?? "";
    }

    control.dataset.parameterIndex = String(index);
    if (parameter.type === "boolean") wrapper.append(control, label);
    else wrapper.append(label, control);
    return wrapper;
  });
}

function createCustomModuleAction() {
  const wrapper = document.createElement("div");
  wrapper.className = "module-action";
  const help = document.createElement("p");
  help.className = "field-help";
  help.textContent =
    "保存时会提取代码中的字符串、数字和布尔值；勾选的项目成为可配置参数，其余内容保留为复用壳。";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button secondary";
  button.textContent = "保存为自定义模块";
  button.addEventListener("click", openCustomModuleDialog);
  wrapper.append(help, button);
  return wrapper;
}

function createAdvancedPanel(step) {
  const details = document.createElement("details");
  details.className = "advanced-panel";
  const summary = document.createElement("summary");
  summary.textContent = "高级设置";
  details.append(summary);

  const help = document.createElement("p");
  help.className = "field-help";
  const textarea = document.createElement("textarea");
  textarea.className = "advanced-code";

  if (step.type === "templateCode") {
    help.textContent = "模板中的 {{param1}} 等占位符会使用上方参数替换。";
    textarea.dataset.property = "template";
    textarea.value = step.values.template || "";
    details.append(help, textarea);
    return details;
  }

  const toggle = document.createElement("label");
  toggle.className = "checkbox-field";
  toggle.innerHTML = `
    <input type="checkbox" data-property="advancedEnabled" ${step.values.advancedEnabled ? "checked" : ""}>
    <span>使用自定义高级代码覆盖自动生成代码</span>
  `;

  help.textContent = step.values.advancedEnabled
    ? "高级代码已启用，基础参数和嵌套步骤不再生成该节点代码。"
    : "默认由基础参数生成代码。启用后才可修改完整代码。";
  textarea.dataset.property = "advancedCode";
  textarea.value = getAdvancedCode(step);
  textarea.disabled = !step.values.advancedEnabled;
  details.append(toggle, help, textarea);
  return details;
}

function updateSelectedStep(event) {
  const step = selectedStep();
  if (!step) return;

  const property = event.target.dataset.property;
  if (property === "advancedEnabled") {
    if (event.target.checked && !step.values.advancedCode) {
      step.values.advancedCode = getAdvancedCode(step);
    }
    step.values.advancedEnabled = event.target.checked;
    renderMutation();
    return;
  }

  if (property === "advancedCode" || property === "template") {
    step.values[property] = event.target.value;
    refreshGeneratedOutput(step);
    return;
  }

  const parameterIndex = event.target.dataset.parameterIndex;
  if (parameterIndex !== undefined) {
    const parameter = step.values.parameters?.[Number(parameterIndex)];
    if (!parameter) return;
    parameter.value = event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;
    refreshGeneratedOutput(step);
    return;
  }

  const fieldKey = event.target.dataset.field;
  if (!fieldKey) return;

  if (step.type === "task" && fieldKey === "taskId") {
    applySavedTask(step, event.target.value);
    renderMutation();
    return;
  }
  if (step.type === "customModule" && fieldKey === "moduleId") {
    applyCustomModule(step, event.target.value);
    renderMutation();
    return;
  }

  step.values[fieldKey] = event.target.type === "checkbox"
    ? event.target.checked
    : event.target.value;

  if ([
    "action",
    "locatorType",
    "conditionType",
    "elseEnabled",
    "valueMode",
    "pathMode",
    "nthEnabled",
    "waitMode",
    "loopType",
    "mode",
    "sessionMode",
    "proxyEnabled",
    "proxyAuthMode"
  ].includes(fieldKey)) {
    renderMutation();
  } else {
    refreshGeneratedOutput(step);
  }
}

function refreshGeneratedOutput(step) {
  elements.codePreview.textContent = generateMjs(state.steps);
  const card = elements.flowList.querySelector(
    `[data-id="${CSS.escape(step.id)}"] .flow-summary span`
  );
  if (card) card.textContent = summarizeStep(step) || "尚未配置";
  saveState();
  scheduleHistorySnapshot();
}

function addStep(type) {
  const step = createStep(type);
  insertStep(state.steps, state.selectedId, step);
  state.selectedId = step.id;
  renderMutation();
}

function runStepAction(action, id) {
  const entry = findStepEntry(state.steps, id);
  if (!entry) return;

  if (action === "child") {
    if (entry.step.type === "task") entry.step.collapsed = false;
    state.selectedId = id;
    render();
    showToast("已选择代码块，请从左侧插入子步骤");
    return;
  }

  if (action === "toggle-enabled") {
    entry.step.enabled = entry.step.enabled === false;
    renderMutation();
    return;
  }

  if (action === "toggle-collapse" && entry.step.type === "task") {
    entry.step.collapsed = entry.step.collapsed === false;
    state.selectedId = id;
    render();
    return;
  }

  if (action === "up") moveStep(state.steps, id, -1);
  if (action === "down") moveStep(state.steps, id, 1);

  if (action === "duplicate") {
    const duplicate = duplicateStep(state.steps, id);
    if (duplicate) state.selectedId = duplicate.id;
  }

  if (action === "delete") {
    const parentId = entry.parent?.id;
    removeStep(state.steps, id);
    state.selectedId = parentId || flattenSteps(state.steps)[0]?.id || null;
  }

  renderMutation();
}

function bindToolbar() {
  document.querySelector("#loadViduTemplate").addEventListener("click", () => {
    if (state.steps.length && !confirm("载入示例会替换当前步骤，是否继续？")) return;
    state.steps = createViduTemplate();
    state.selectedId = state.steps[0]?.id ?? null;
    renderMutation();
    showToast("已载入 Vidu 示例");
  });

  document.querySelector("#clearFlow").addEventListener("click", () => {
    if (state.steps.length && !confirm("确定清空全部步骤？")) return;
    state = { steps: [], selectedId: null };
    renderMutation();
  });

  document.querySelector("#copyCode").addEventListener("click", async () => {
    await navigator.clipboard.writeText(generateMjs(state.steps));
    showToast("MJS 代码已复制");
  });

  document.querySelector("#downloadMjs").addEventListener("click", () => {
    download("playwright-flow.mjs", generateMjs(state.steps), "text/javascript");
    showToast("已生成 playwright-flow.mjs");
  });

  document.querySelector("#exportJson").addEventListener("click", () => {
    download(
      "playwright-flow.json",
      JSON.stringify(state.steps, null, 2),
      "application/json"
    );
    showToast("流程 JSON 已导出");
  });

  document.querySelector("#importJson").addEventListener("click", () => {
    elements.jsonFileInput.click();
  });

  document.querySelector("#importMjs").addEventListener("click", () => {
    elements.mjsFileInput.click();
  });

  elements.mjsFileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (state.steps.length && !confirm("导入 MJS 会替换当前步骤，是否继续？")) return;
      const result = parseMjs(await file.text());
      state.steps = result.steps;
      state.selectedId = flattenSteps(result.steps)[0]?.id ?? null;
      renderMutation();
      const modeText = result.mode === "metadata"
        ? `结构化还原 ${result.recognized} 步`
        : `识别 ${result.recognized} 步，自定义代码 ${result.custom} 步`;
      showToast(`MJS 已导入：${modeText}`);
    } catch (error) {
      showToast(`MJS 导入失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  });

  elements.jsonFileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("JSON 根节点必须是步骤数组");
      state.steps = normalizeSteps(parsed);
      state.selectedId = flattenSteps(state.steps)[0]?.id ?? null;
      renderMutation();
      showToast("流程 JSON 已导入");
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  });

  document.querySelector("#copyExternalMjs").addEventListener("click", async () => {
    const sourcePath = elements.externalScriptPath.value.trim();
    if (!sourcePath) return showToast("请填写外部 MJS 的绝对路径");
    try {
      const result = await api("/api/scripts/copy", { sourcePath });
      showToast(`已复制：${result.script.relativePath}`);
    } catch (error) {
      showToast(`复制失败：${error.message}`);
    }
  });

  document.querySelector("#runExternalMjs").addEventListener("click", async () => {
    const sourcePath = elements.externalScriptPath.value.trim();
    if (!sourcePath) return showToast("请填写外部 MJS 的绝对路径");
    await startRun({ sourcePath });
  });

  document.querySelector("#runCurrentMjs").addEventListener("click", async () => {
    await startRun({
      source: generateMjs(state.steps),
      name: "current-workflow.mjs"
    });
  });

  elements.stopCurrentRun.addEventListener("click", stopCurrentRun);
  elements.undoFlow.addEventListener("click", undoFlow);
  elements.redoFlow.addEventListener("click", redoFlow);
  document.querySelector("#openSettings").addEventListener("click", openSettings);
  elements.settingsForm.addEventListener("submit", saveSettings);
  document.querySelector("#clearHistory").addEventListener("click", clearHistory);
  elements.settingsDialog.querySelectorAll('[data-action="close-settings"]')
    .forEach(button => button.addEventListener("click", () => {
      elements.settingsDialog.close();
    }));
  window.addEventListener("keydown", handleHistoryShortcut);
  document.querySelector("#ensureBrowser").addEventListener("click", ensureBrowser);
  document.querySelector("#saveWorkflowTask").addEventListener("click", () => {
    saveTask(state.steps, "当前流程");
  });
  document.querySelector("#saveSelectedTask").addEventListener("click", () => {
    openTaskRangeDialog();
  });
  document.querySelector("#importTaskModule").addEventListener("click", importTaskModule);
  elements.taskRangeStart.addEventListener("change", refreshTaskRangeEndOptions);
  elements.taskRangeForm.addEventListener("submit", saveTaskRange);
  elements.taskRangeDialog.querySelectorAll('[data-action="close-range"]')
    .forEach(button => button.addEventListener("click", () => {
      elements.taskRangeDialog.close();
    }));
  elements.customModuleForm.addEventListener("submit", saveCustomModule);
  elements.customModuleDialog
    .querySelectorAll('[data-action="close-custom-module"]')
    .forEach(button => button.addEventListener("click", () => {
      elements.customModuleDialog.close();
    }));
  document.querySelector("#clearRunOutput").addEventListener("click", () => {
    elements.runOutput.textContent = "尚未运行脚本。";
  });
}

function selectedStep() {
  return findStepEntry(state.steps, state.selectedId)?.step ?? null;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(PREVIOUS_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed?.steps)) {
      const steps = normalizeSteps(parsed.steps);
      return {
        steps,
        selectedId: findFlowEntry(steps, parsed.selectedId)
          ? parsed.selectedId
          : flattenSteps(steps)[0]?.id ?? null
      };
    }
  } catch {
    // Ignore malformed local data and start with an empty workflow.
  }
  return { steps: [], selectedId: null };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function initializeRuntime() {
  try {
    const health = await api("/api/health");
    if (
      health.version !== SERVICE_VERSION ||
      health.historyApiVersion !== HISTORY_API_VERSION
    ) {
      throw new Error("本地服务版本过旧，请关闭旧服务后重新双击启动脚本");
    }
    elements.runtimeStatus.textContent = `服务正常 · ${health.node}`;
    await Promise.all([refreshTasks(), initializeHistory(), refreshLatestRun()]);
  } catch (error) {
    elements.runtimeStatus.textContent = `本地服务异常：${error.message}`;
  }
}

async function ensureBrowser() {
  const connect = findPreferredStep(state.steps, state.selectedId, "connect");
  const values = connect?.values || {};
  if ((values.sessionMode || "cdp") !== "cdp") {
    elements.runtimeStatus.textContent =
      "持久化/临时 Context 由当前 MJS 启动，请点击“运行当前脚本”";
    showToast("该会话模式不使用 CDP 端口，请运行当前脚本");
    return;
  }
  const endpoint = values.endpoint || "http://127.0.0.1:9222";
  elements.runtimeStatus.textContent = `正在检测 CDP：${endpoint}`;
  try {
    const result = await api("/api/browser/ensure", {
      endpoint,
      startUrl: values.startUrl || "https://www.vidu.com/zh/create/character2video",
      userDataDir:
        values.userDataDir || "%TEMP%\\vidu-edge-profile-{account}-{port}",
      accountName: values.accountName || "account1",
      edgePath: values.edgePath || "",
      timeout: values.waitTimeout || 30000,
      proxyServer: values.proxyEnabled ? values.proxyServer : "",
      proxyBypass: values.proxyEnabled ? values.proxyBypass : "",
      proxyAuthMode: values.proxyEnabled ? values.proxyAuthMode : "none",
      proxyUsername: values.proxyUsername,
      proxyPassword: values.proxyPassword,
      proxyUsernameEnv: values.proxyUsernameEnv,
      proxyPasswordEnv: values.proxyPasswordEnv
    });
    elements.runtimeStatus.textContent = result.status.warning
      ? result.status.warning
      : result.status.launched
      ? `Edge 已启动：${result.status.endpoint}`
      : `CDP 已存在，直接复用：${result.status.endpoint}`;
    showToast(elements.runtimeStatus.textContent);
  } catch (error) {
    elements.runtimeStatus.textContent = `浏览器启动失败：${error.message}`;
    showToast(elements.runtimeStatus.textContent);
  }
}

async function startRun(payload) {
  if (!confirm("脚本会在本机以当前用户权限执行。确认继续？")) return;
  clearInterval(runPollTimer);
  elements.runtimeStatus.textContent = "脚本启动中...";
  elements.runOutput.textContent = "";
  try {
    const result = await api("/api/scripts/run", payload);
    currentRunId = result.run.id;
    updateStopButton();
    elements.runtimeStatus.textContent = `运行中：${result.run.script.name}`;
    renderRun(result.run);
    startRunPolling(result.run.id);
  } catch (error) {
    currentRunId = null;
    updateStopButton();
    elements.runtimeStatus.textContent = `运行失败：${error.message}`;
    elements.runOutput.textContent = error.stack || error.message;
  }
}

function renderRun(run) {
  elements.runtimeStatus.textContent =
    `${run.status} · ${run.script.name}${run.exitCode === null ? "" : ` · exit ${run.exitCode}`}`;
  elements.runOutput.textContent = run.output || "进程已启动，等待输出...";
  elements.runOutput.scrollTop = elements.runOutput.scrollHeight;
}

async function stopCurrentRun() {
  if (!currentRunId) return;
  elements.stopCurrentRun.disabled = true;
  elements.runtimeStatus.textContent = "正在终止运行...";
  try {
    const result = await api(
      `/api/runs/${encodeURIComponent(currentRunId)}/stop`,
      {}
    );
    renderRun(result.run);
    startRunPolling(currentRunId);
  } catch (error) {
    elements.runtimeStatus.textContent = `终止失败：${error.message}`;
    updateStopButton();
  }
}

async function refreshLatestRun() {
  const result = await api("/api/runs/latest");
  if (["running", "stopping"].includes(result.run?.status)) {
    currentRunId = result.run.id;
    renderRun(result.run);
    startRunPolling(result.run.id);
  }
  updateStopButton();
}

function startRunPolling(runId) {
  clearInterval(runPollTimer);
  runPollTimer = setInterval(async () => {
    try {
      const latest = await api(`/api/runs/${encodeURIComponent(runId)}`);
      renderRun(latest.run);
      if (!["running", "stopping"].includes(latest.run.status)) {
        clearInterval(runPollTimer);
        currentRunId = null;
        updateStopButton();
      }
    } catch (error) {
      clearInterval(runPollTimer);
      elements.runtimeStatus.textContent = `读取日志失败：${error.message}`;
    }
  }, 600);
}

function updateStopButton() {
  elements.stopCurrentRun.disabled = !currentRunId;
}

async function initializeHistory() {
  const result = await api("/api/history");
  setHistoryStatus(result.history);
  await recordHistorySnapshot();
}

function scheduleHistorySnapshot() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    recordHistorySnapshot();
  }, 350);
}

async function flushHistorySnapshot() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    await recordHistorySnapshot();
  } else {
    await historyQueue;
  }
}

function recordHistorySnapshot() {
  const steps = structuredClone(state.steps);
  historyQueue = historyQueue
    .then(() => api("/api/history/snapshot", { steps }))
    .then(result => setHistoryStatus(result.history))
    .catch(error => {
      elements.runtimeStatus.textContent = `历史快照写入失败：${error.message}`;
    });
  return historyQueue;
}

async function undoFlow() {
  await moveHistory("undo");
}

async function redoFlow() {
  await moveHistory("redo");
}

async function moveHistory(direction) {
  await flushHistorySnapshot();
  if (direction === "undo" && !historyStatus.canUndo) return;
  if (direction === "redo" && !historyStatus.canRedo) return;
  const result = await api(`/api/history/${direction}`, {});
  if (result.history.snapshot) {
    state.steps = normalizeSteps(result.history.snapshot.steps || []);
    state.selectedId = flattenSteps(state.steps)[0]?.id ?? null;
    render();
  }
  setHistoryStatus(result.history);
}

function handleHistoryShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoFlow();
  else undoFlow();
}

function openSettings() {
  elements.historyLimit.value = String(historyStatus.limit);
  renderHistoryStatus();
  elements.settingsDialog.showModal();
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const result = await api("/api/history/settings", {
      limit: Number(elements.historyLimit.value)
    });
    setHistoryStatus(result.history);
    elements.settingsDialog.close();
    showToast(`历史上限已设为 ${result.history.limit} 步`);
  } catch (error) {
    elements.historySummary.textContent = `保存失败：${error.message}`;
    showToast(`设置保存失败：${error.message}`);
  }
}

async function clearHistory() {
  if (!confirm("确定清空磁盘中的全部历史快照？当前流程不会被删除。")) return;
  const result = await api("/api/history/clear", {});
  setHistoryStatus(result.history);
  await recordHistorySnapshot();
  showToast("历史缓存已清空，当前流程已作为新起点");
}

function setHistoryStatus(status) {
  historyStatus = { ...historyStatus, ...status };
  renderHistoryStatus();
}

function renderHistoryStatus() {
  elements.undoFlow.disabled = !historyStatus.canUndo;
  elements.redoFlow.disabled = !historyStatus.canRedo;
  elements.historySummary.textContent =
    `已保存 ${historyStatus.count} 个快照，上限 ${historyStatus.limit} 个。` +
    `当前位置 ${historyStatus.index < 0 ? 0 : historyStatus.index + 1}/${historyStatus.count}。`;
}

async function saveTask(sourceSteps, defaultName, requestedName = "") {
  const name = requestedName || prompt("任务名称", defaultName);
  if (!name) return false;
  try {
    await api("/api/tasks", {
      name,
      mode: "structured",
      steps: structuredClone(sourceSteps)
    });
    await refreshTasks();
    showToast(`任务已保存：${name}`);
    return true;
  } catch (error) {
    showToast(`保存任务失败：${error.message}`);
    return false;
  }
}

async function importTaskModule() {
  const sourcePath = elements.taskModulePath.value.trim();
  if (!sourcePath) return showToast("请填写任务 MJS 的绝对路径");
  const fileName = sourcePath.split(/[\\/]/).at(-1) || "外部任务";
  const name = prompt("任务名称", fileName.replace(/\.m?js$/i, ""));
  if (!name) return;
  try {
    await api("/api/tasks/import-module", { sourcePath, name });
    await refreshTasks();
    showToast(`模块任务已导入：${name}`);
  } catch (error) {
    showToast(`导入任务失败：${error.message}`);
  }
}

async function refreshTasks() {
  const result = await api("/api/tasks");
  taskRegistry = result.tasks || [];
  if (["task", "customModule"].includes(selectedStep()?.type)) renderInspector();
}

function applySavedTask(step, taskId) {
  const saved = taskRegistry.find(task => task.id === taskId);
  step.values.taskId = taskId;
  step.values.name = saved?.name || "";
  step.values.savedMode = saved?.mode || "structured";
  step.values.modulePath = saved?.modulePath || "";
  step.children = saved
    ? rekeySteps(normalizeSteps(structuredClone(saved.steps || [])))
    : [];
  step.collapsed = true;
}

function applyCustomModule(step, moduleId) {
  const saved = taskRegistry.find(
    task => task.id === moduleId && task.mode === "custom"
  );
  step.values.moduleId = moduleId;
  step.values.moduleName = saved?.name || "";
  step.values.template = saved?.template || "";
  step.values.parameters = structuredClone(saved?.parameters || []);
}

function openCustomModuleDialog() {
  const step = selectedStep();
  if (step?.type !== "custom") return;
  const code = String(step.values.code || "").trim();
  if (!code) {
    showToast("请先填写自定义代码");
    return;
  }

  const draft = parameterizeCode(code);
  customModuleDraft = {
    template: draft.template,
    parameters: draft.parameters.map(parameter => ({
      ...parameter,
      enabled: true
    }))
  };
  elements.customModuleName.value = "";
  renderCustomModuleParameters();
  elements.customModuleDialog.showModal();
  elements.customModuleName.focus();
}

function renderCustomModuleParameters() {
  const parameters = customModuleDraft?.parameters || [];
  if (!parameters.length) {
    const empty = document.createElement("p");
    empty.className = "condition-help";
    empty.textContent = "未发现字符串、数字或布尔值。仍可保存为无参数模块。";
    elements.customModuleParameters.replaceChildren(empty);
    return;
  }

  elements.customModuleParameters.replaceChildren(
    ...parameters.map((parameter, index) => {
      const row = document.createElement("div");
      row.className = "module-parameter-row";
      row.innerHTML = `
        <label class="checkbox-field module-parameter-toggle">
          <input type="checkbox" data-module-index="${index}" data-module-field="enabled" checked>
          <span>设为参数</span>
        </label>
        <input data-module-index="${index}" data-module-field="label" value="${escapeAttribute(parameter.label)}" aria-label="参数名称">
        <select data-module-index="${index}" data-module-field="type" aria-label="参数类型">
          ${["string", "number", "boolean", "expression"].map(type =>
            `<option value="${type}" ${parameter.type === type ? "selected" : ""}>${type}</option>`
          ).join("")}
        </select>
        <input data-module-index="${index}" data-module-field="value" value="${escapeAttribute(parameter.value)}" aria-label="默认值">
      `;
      return row;
    })
  );
  elements.customModuleParameters.oninput = updateCustomModuleDraft;
  elements.customModuleParameters.onchange = updateCustomModuleDraft;
}

function updateCustomModuleDraft(event) {
  const index = Number(event.target.dataset.moduleIndex);
  const field = event.target.dataset.moduleField;
  const parameter = customModuleDraft?.parameters?.[index];
  if (!parameter || !field) return;
  parameter[field] = event.target.type === "checkbox"
    ? event.target.checked
    : event.target.value;
}

async function saveCustomModule(event) {
  event.preventDefault();
  if (!customModuleDraft) return;
  const name = elements.customModuleName.value.trim();
  if (!name) return;
  const module = finalizeParameterizedTemplate(
    customModuleDraft.template,
    customModuleDraft.parameters
  );
  try {
    await api("/api/tasks", {
      name,
      mode: "custom",
      template: module.template,
      parameters: module.parameters
    });
    await refreshTasks();
    elements.customModuleDialog.close();
    customModuleDraft = null;
    showToast(`自定义模块已保存：${name}`);
  } catch (error) {
    showToast(`保存自定义模块失败：${error.message}`);
  }
}

function rekeySteps(steps) {
  for (const step of steps) {
    step.id = createId();
    rekeySteps(step.children || []);
    rekeySteps(step.elseChildren || []);
  }
  return steps;
}

function openTaskRangeDialog() {
  taskRangeEntries = flattenSteps(state.steps, {
    includeCollapsedChildren: false
  }).filter(entry => entry.kind === "step");

  if (!taskRangeEntries.length) {
    showToast("当前没有可打包的步骤");
    return;
  }

  elements.taskRangeStart.replaceChildren(
    ...taskRangeEntries.map(entry => taskRangeOption(entry))
  );
  const selected = taskRangeEntries.find(entry => entry.id === state.selectedId);
  elements.taskRangeStart.value = selected?.id || taskRangeEntries[0].id;
  elements.taskRangeName.value = "";
  refreshTaskRangeEndOptions();
  elements.taskRangeDialog.showModal();
  elements.taskRangeName.focus();
}

function refreshTaskRangeEndOptions() {
  const start = taskRangeEntries.find(
    entry => entry.id === elements.taskRangeStart.value
  );
  const candidates = start
    ? taskRangeEntries.filter(entry =>
        entry.container === start.container && entry.index >= start.index
      )
    : [];
  elements.taskRangeEnd.replaceChildren(
    ...candidates.map(entry => taskRangeOption(entry))
  );
  if (candidates.length) {
    elements.taskRangeEnd.value = candidates.at(-1).id;
  }
}

function taskRangeOption(entry) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = `${entry.number} · ${STEP_DEFINITIONS[entry.step.type]?.label || entry.step.type} · ${summarizeStep(entry.step)}`;
  return option;
}

async function saveTaskRange(event) {
  event.preventDefault();
  const sourceSteps = getStepRange(
    state.steps,
    elements.taskRangeStart.value,
    elements.taskRangeEnd.value
  );
  if (!sourceSteps) {
    showToast("开始和结束步骤必须位于同一层级");
    return;
  }

  const saved = await saveTask(
    sourceSteps,
    "步骤任务",
    elements.taskRangeName.value.trim()
  );
  if (saved) elements.taskRangeDialog.close();
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
