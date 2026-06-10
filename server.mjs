import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRuntimeService,
  ensureEdgeBrowser,
  probeCdp
} from "./runtime-service.mjs";
import { createHistoryService } from "./history-service.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8765);
const runtime = createRuntimeService(root);
const history = createHistoryService(root);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl);
      return;
    }
    await serveStatic(response, requestUrl);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

async function handleApi(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "playwright-flow-studio",
      node: process.version
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/runs/latest") {
    sendJson(response, 200, { ok: true, run: runtime.getLatestRun() });
    return;
  }

  const stopMatch = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/stop$/);
  if (request.method === "POST" && stopMatch) {
    const run = await runtime.stopRun(decodeURIComponent(stopMatch[1]));
    sendJson(response, 200, { ok: true, run });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/runs/")) {
    const id = decodeURIComponent(requestUrl.pathname.slice("/api/runs/".length));
    const run = runtime.getRun(id);
    sendJson(response, run ? 200 : 404, {
      ok: Boolean(run),
      run,
      error: run ? undefined : "未找到运行记录"
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/scripts/copy") {
    const body = await readJson(request);
    const script = await runtime.copyScript(body.sourcePath);
    sendJson(response, 200, { ok: true, script: publicScript(script) });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/scripts/run") {
    const body = await readJson(request);
    if (body.source === undefined && !body.sourcePath) {
      throw new Error("必须提供当前代码或外部 MJS 路径");
    }
    const run = await runtime.runScript(body);
    sendJson(response, 202, { ok: true, run });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/browser/status") {
    const status = await probeCdp(requestUrl.searchParams.get("endpoint"));
    sendJson(response, 200, { ok: true, status });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/browser/ensure") {
    const status = await ensureEdgeBrowser(await readJson(request));
    sendJson(response, 200, { ok: true, status });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/tasks") {
    sendJson(response, 200, { ok: true, tasks: await runtime.listTasks() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/tasks") {
    const task = await runtime.saveTask(await readJson(request));
    sendJson(response, 200, { ok: true, task });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/tasks/import-module") {
    const body = await readJson(request);
    const task = await runtime.importTaskModule(body.sourcePath, body.name);
    sendJson(response, 200, { ok: true, task });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/history") {
    sendJson(response, 200, { ok: true, history: await history.getStatus() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/history/snapshot") {
    const body = await readJson(request);
    const status = await history.record({
      steps: Array.isArray(body.steps) ? body.steps : []
    });
    sendJson(response, 200, { ok: true, history: status });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/history/undo") {
    sendJson(response, 200, { ok: true, history: await history.undo() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/history/redo") {
    sendJson(response, 200, { ok: true, history: await history.redo() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/history/settings") {
    sendJson(response, 200, {
      ok: true,
      history: await history.updateSettings(await readJson(request))
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/history/clear") {
    sendJson(response, 200, { ok: true, history: await history.clear() });
    return;
  }

  sendJson(response, 404, { ok: false, error: "未找到接口" });
}

async function serveStatic(response, requestUrl) {
  const relativePath = requestUrl.pathname === "/"
    ? "index.html"
    : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ||
        "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error("请求内容超过 5MB");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function publicScript(script) {
  return {
    name: script.name,
    relativePath: script.relativePath
  };
}

server.listen(port, host, () => {
  console.log(`Playwright Flow Studio: http://${host}:${port}`);
});
