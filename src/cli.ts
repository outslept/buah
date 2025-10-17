import fs from 'node:fs/promises'
import path from 'node:path'
import * as p from '@clack/prompts'
import { build_registry_from_dir, save_registry, list_names, load_registry } from './registry.js'
import { plan_install, add_items } from './install.js'

const REGISTRY_PATH = path.resolve(process.cwd(), 'registry.json')

async function cmd_build () {
  const s = p.spinner()
  s.start('Building registry from ./lib')
  const reg = await build_registry_from_dir(path.resolve(process.cwd(), 'lib'))
  await save_registry(REGISTRY_PATH, reg)
  s.stop('Wrote ./registry.json')
}

async function cmd_add () {
  try {
    await fs.access(REGISTRY_PATH)
  } catch {
    p.log.error('registry.json not found. Run: build')
    return
  }

  const names = await list_names(REGISTRY_PATH)

  const picked_res = await p.multiselect({
    message: 'Select snippets to add',
    options: names.map((n) => ({ value: n, label: n })),
    required: true,
  })

  if (p.isCancel(picked_res)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  const picked = picked_res

  const dest_base_res = await p.text({
    message: 'Destination directory',
    initialValue: '.',
    placeholder: './src',
  })

  if (p.isCancel(dest_base_res)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  const dest_root = path.resolve(process.cwd(), dest_base_res || '.')

  const reg = await load_registry(REGISTRY_PATH)

  const rename_map: Record<string, string> = {}

  for (const name of picked) {
    const item = reg[name]
    if (!item || item.files.length !== 1) continue

    const only_file = item.files[0]
    const ext = path.posix.extname(only_file!.path) || '.ts'
    const default_leaf = `${name}${ext}`

    const ans = await p.text({
      message: `Filename for "${name}"`,
      placeholder: default_leaf,
      initialValue: default_leaf,
    })

    if (p.isCancel(ans)) {
      p.cancel('Cancelled')
      process.exit(0)
    }
    const trimmed = (ans || '').trim()
    if (trimmed && trimmed !== path.posix.basename(only_file!.path)) {
      rename_map[name] = trimmed
    }
  }

  const plan = await plan_install(REGISTRY_PATH, picked, dest_root, rename_map)

  let overwrite = false

  if (plan.collisions > 0) {
    const ow = await p.confirm({
      message: `Overwrite ${plan.collisions} existing file(s) in ${path.relative(process.cwd(), dest_root) || '.'}?`,
      initialValue: false,
    })

    if (p.isCancel(ow)) {
      p.cancel('Cancelled')
      process.exit(0)
    }

    if (!ow) {
      p.cancel('Aborted')
      return
    }

    overwrite = true
  }

  const s = p.spinner()
  s.start('Installing')
  const res = await add_items(REGISTRY_PATH, picked, dest_root, overwrite, rename_map)
  s.stop('Install complete')

  for (const r of res) {
    if (r.collisions.length && !overwrite) p.log.warn(`${r.name}: skipped ${r.skipped} file(s)`)
    p.log.message(`${r.name}: written=${r.written} skipped=${r.skipped}`, { symbol: '-' })
  }
}

const cmd = process.argv[2]
if (cmd === 'build') cmd_build()
else if (cmd === 'add') cmd_add()
else {
  console.log('Usage:')
  console.log('  tsx src/cli.ts build   # builds ./registry.json from ./lib/<snippet>/*')
  console.log('  tsx src/cli.ts add     # installs to a directory you pick with optional filename override')
  process.exit(1)
}
