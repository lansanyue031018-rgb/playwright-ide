import { pathToFileURL } from "node:url";

const scriptPath = process.argv[2];

if (!scriptPath) {
  console.error("未提供要执行的 MJS 路径");
  process.exit(1);
}

try {
  await import(pathToFileURL(scriptPath).href);
  process.exit(0);
} catch (error) {
  console.error(error?.stack || error);
  process.exit(1);
}
