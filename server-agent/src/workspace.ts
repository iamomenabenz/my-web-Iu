import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeRelativePath } from "./safety.js";

export async function workspaceInfo(root: string) {
  await fs.mkdir(root, { recursive: true });
  await fs.access(root);
  return { root, writable: true };
}

export async function listFiles(root: string, dir = ".", limit = 200) {
  const full = assertSafeRelativePath(dir, root);
  const entries = await fs.readdir(full, { withFileTypes: true });
  return {
    root,
    path: path.relative(root, full) || ".",
    entries: entries.slice(0, limit).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "dir" : "file" })),
  };
}
