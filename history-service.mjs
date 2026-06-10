import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const MIN_LIMIT = 2;
const MAX_LIMIT = 500;

export function createHistoryService(root, options = {}) {
  const cacheRoot = path.join(root, ".flow-cache");
  const snapshotsDir = path.join(cacheRoot, "snapshots");
  const manifestPath = path.join(cacheRoot, "history.json");
  const defaultLimit = normalizeLimit(options.defaultLimit, 50);

  async function ensureDirectories() {
    await mkdir(snapshotsDir, { recursive: true });
  }

  async function readManifest() {
    await ensureDirectories();
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return {
        limit: normalizeLimit(parsed.limit, defaultLimit),
        index: Math.min(Math.max(Number(parsed.index) || 0, 0), Math.max(entries.length - 1, 0)),
        entries
      };
    } catch {
      return { limit: defaultLimit, index: 0, entries: [] };
    }
  }

  async function writeManifest(manifest) {
    await ensureDirectories();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  async function readSnapshot(entry) {
    if (!entry) return null;
    return JSON.parse(
      await readFile(path.join(snapshotsDir, entry.file), "utf8")
    );
  }

  async function removeEntries(entries) {
    await Promise.all(entries.map(entry =>
      rm(path.join(snapshotsDir, entry.file), { force: true })
    ));
  }

  async function trimToLimit(manifest) {
    if (manifest.entries.length <= manifest.limit) return manifest;
    const excess = manifest.entries.length - manifest.limit;
    const removed = manifest.entries.splice(0, excess);
    manifest.index = Math.max(0, manifest.index - excess);
    await removeEntries(removed);
    return manifest;
  }

  async function record(snapshot) {
    const manifest = await readManifest();
    const serialized = JSON.stringify(snapshot);
    const current = await readSnapshot(manifest.entries[manifest.index]);
    if (current && JSON.stringify(current) === serialized) {
      return statusFromManifest(manifest);
    }

    const abandoned = manifest.entries.splice(manifest.index + 1);
    await removeEntries(abandoned);

    const id = `${Date.now()}-${randomUUID()}`;
    const file = `${id}.json`;
    await writeFile(path.join(snapshotsDir, file), serialized, "utf8");
    manifest.entries.push({
      id,
      file,
      createdAt: new Date().toISOString()
    });
    manifest.index = manifest.entries.length - 1;
    await trimToLimit(manifest);
    await writeManifest(manifest);
    return statusFromManifest(manifest);
  }

  async function move(direction) {
    const manifest = await readManifest();
    if (manifest.entries.length) {
      manifest.index = Math.min(
        Math.max(manifest.index + direction, 0),
        manifest.entries.length - 1
      );
      await writeManifest(manifest);
    }
    return {
      ...statusFromManifest(manifest),
      snapshot: await readSnapshot(manifest.entries[manifest.index])
    };
  }

  async function updateSettings(settings = {}) {
    const manifest = await readManifest();
    manifest.limit = normalizeLimit(settings.limit, manifest.limit);
    await trimToLimit(manifest);
    await writeManifest(manifest);
    return statusFromManifest(manifest);
  }

  async function clear() {
    const manifest = await readManifest();
    await removeEntries(manifest.entries);
    const cleared = { limit: manifest.limit, index: 0, entries: [] };
    await writeManifest(cleared);
    return statusFromManifest(cleared);
  }

  return {
    clear,
    getStatus: async () => statusFromManifest(await readManifest()),
    record,
    redo: () => move(1),
    undo: () => move(-1),
    updateSettings
  };
}

function statusFromManifest(manifest) {
  return {
    limit: manifest.limit,
    count: manifest.entries.length,
    index: manifest.entries.length ? manifest.index : -1,
    canUndo: manifest.entries.length > 0 && manifest.index > 0,
    canRedo: manifest.entries.length > 0 &&
      manifest.index < manifest.entries.length - 1
  };
}

function normalizeLimit(value, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}
