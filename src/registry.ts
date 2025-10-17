import fs from "node:fs/promises";
import path from "node:path";
import type { Registry } from "./types.js";

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const it of items) {
    const abs = path.join(dir, it.name);
    const rel = path.relative(base, abs).replace(/\\/g, "/");
    if (it.isDirectory()) {
      const nested = await walk(abs, base);
      for (const n of nested) out.push(n);
    } else {
      out.push(rel);
    }
  }
  return out;
}

export async function build_registry_from_dir(snips_dir: string): Promise<Registry> {
  const entries = await fs.readdir(snips_dir, { withFileTypes: true });
  const dirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);

  const registry: Registry = {};

  for (const dir of dirs) {
    const base = path.join(snips_dir, dir);
    const rel_files = await walk(base, base);
    const files = await Promise.all(
      rel_files.map(async (rel) => ({
        path: rel,
        content: await fs.readFile(path.join(base, rel), "utf8"),
      }))
    );
    registry[dir] = { files };
  }

  return registry;
}

export async function save_registry(file: string, reg: Registry) {
  await fs.writeFile(file, JSON.stringify(reg, null, 2));
}

export async function load_registry(file: string): Promise<Registry> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function list_names(registry_path: string): Promise<string[]> {
  const reg = await load_registry(registry_path);
  return Object.keys(reg).sort();
}