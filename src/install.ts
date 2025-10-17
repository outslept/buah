import fs from "node:fs/promises";
import path from "node:path";
import { load_registry } from "./registry.js";

async function ensure_dir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function clean_rel(rel: string) {
  return rel.replace(/^[\\/]+/, "");
}

export function compute_out_rel(file_rel: string, new_name?: string) {
  const rel = clean_rel(file_rel);
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  if (!new_name || new_name.trim() === "" || new_name === base) return rel;
  const leaf_raw = new_name.replace(/^[\\/]+/, "").split(/[\\/]/).pop() || new_name;
  const ext_orig = path.posix.extname(base);
  const ext_new = path.posix.extname(leaf_raw);
  const leaf = ext_new ? leaf_raw : leaf_raw + ext_orig;
  return dir === "." ? leaf : `${dir}/${leaf}`;
}

async function write_file(dest_root: string, rel: string, content: string) {
  const dest = path.join(dest_root, clean_rel(rel));
  await ensure_dir(path.dirname(dest));
  await fs.writeFile(dest, content);
}

async function exists_file(dest_root: string, rel: string) {
  const dest = path.join(dest_root, clean_rel(rel));
  try {
    await fs.access(dest);
    return true;
  } catch {
    return false;
  }
}

export async function plan_install(
  registry_path: string,
  names: string[],
  dest_root: string,
  rename_map?: Record<string, string>
) {
  const reg = await load_registry(registry_path);
  let collisions = 0;

  for (const name of names) {
    const item = reg[name];
    if (!item) continue;
    const single_rename = rename_map?.[name];
    for (const f of item.files) {
      const out_rel = item.files.length === 1
        ? compute_out_rel(f.path, single_rename)
        : compute_out_rel(f.path);
      const exists = await exists_file(dest_root, out_rel);
      if (exists) collisions += 1;
    }
  }

  return { collisions };
}

export async function add_items(
  registry_path: string,
  names: string[],
  dest_root: string,
  overwrite: boolean,
  rename_map?: Record<string, string>
) {
  const reg = await load_registry(registry_path);

  const results: { name: string; written: number; skipped: number; collisions: string[] }[] = [];

  for (const name of names) {
    const item = reg[name];
    if (!item) throw new Error(`Not found in registry: ${name}`);

    let written = 0;
    let skipped = 0;
    const collisions: string[] = [];
    const single_rename = rename_map?.[name];

    for (const f of item.files) {
      const out_rel = item.files.length === 1
        ? compute_out_rel(f.path, single_rename)
        : compute_out_rel(f.path);
      const exists = await exists_file(dest_root, out_rel);

      if (exists && !overwrite) {
        skipped += 1;
        collisions.push(out_rel);
        continue;
      }

      await write_file(dest_root, out_rel, f.content);
      written += 1;
    }

    results.push({ name, written, skipped, collisions });
  }

  return results;
}
