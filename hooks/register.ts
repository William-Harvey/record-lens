import type { Register } from 'claude-code'

// record-lens: one command, /record <file> [baseline], driven by a per-project spec so the plugin knows no project.
// Spec: <cwd>/.claude/record-lens.json = { "root": "a.b", "fields": [ { "label": "...", "path": "x.y[0].z", "kind": "value|text|count|keys|table", "max": 400 } ] }
//   path: dotted keys and [n] indexes, resolved under `root` (optional). kind decides the rendering:
//   value  = JSON of the value (numbers, small objects)  · text = a string cut to `max` chars · count = length of a list / object
//   keys   = the keys of an object                      · table = a list of objects: one line per element with the keys named in "columns"
// With a baseline record, every field is shown as `before → after` where it differs (deterministic string comparison).

type Field = { label: string; path: string; kind?: 'value' | 'text' | 'count' | 'keys' | 'table'; max?: number; columns?: string[] }
type Spec = { root?: string; fields: Field[] }

let cwd = ''

function resolve(obj: any, path: string): any {
  if (!path) return obj
  let cur = obj
  for (const part of path.split('.')) {
    if (cur === undefined || cur === null) return undefined
    const m = part.match(/^([^\[]*)((\[\d+\])*)$/)
    const key = m?.[1] ?? part
    if (key) cur = cur[key]
    for (const idx of (m?.[2] ?? '').matchAll(/\[(\d+)\]/g)) cur = Array.isArray(cur) ? cur[Number(idx[1])] : undefined
  }
  return cur
}

function render(v: any, f: Field): string {
  if (v === undefined) return '(absent)'
  switch (f.kind ?? 'value') {
    case 'text': { const s = String(v).replace(/\s+/g, ' '); const max = f.max ?? 400; return s.length > max ? s.slice(0, max) + '…' : s }
    case 'count': return Array.isArray(v) ? `${v.length}` : v && typeof v === 'object' ? `${Object.keys(v).length}` : String(v)
    case 'keys': return v && typeof v === 'object' ? Object.keys(v).join(', ') : String(v)
    case 'table': {
      if (!Array.isArray(v)) return JSON.stringify(v).slice(0, f.max ?? 400)
      const cols = f.columns ?? Object.keys(v[0] ?? {}).slice(0, 6)
      return v.slice(0, 60).map(row => cols.map(c => `${c}=${JSON.stringify(row?.[c])}`).join(' ')).join('\n    ')
    }
    default: { const s = JSON.stringify(v); const max = f.max ?? 400; return s.length > max ? s.slice(0, max) + '…' : s }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'record', description: 'Summarise a JSON run record through the project spec, optionally diffed against a baseline record.', argumentHint: '<file> [baseline]' })
    return next(e)
  })

  on('command.run', { command: 'record' }, async ($, e) => {
    const [file, baseline] = e.args.trim().split(/\s+/).filter(Boolean)
    if (!file) return { text: 'usage: /record <file> [baseline]   (spec: .claude/record-lens.json)' }
    const specPath = `${cwd}/.claude/record-lens.json`
    if (!(await $.fs.exists(specPath))) return { text: `no spec at ${specPath}; write one: { "root": "...", "fields": [ { "label": "timings", "path": "timings", "kind": "value" } ] }` }
    let spec: Spec
    try { spec = JSON.parse(await $.fs.read(specPath)) } catch (err) { return { text: `spec unreadable: ${String(err)}` } }
    const abs = (p: string) => (p.startsWith('/') ? p : `${cwd}/${p}`)
    let rec: any, base: any
    try { rec = JSON.parse(await $.fs.read(abs(file))) } catch (err) { return { text: `record unreadable: ${String(err)}` } }
    if (baseline) { try { base = JSON.parse(await $.fs.read(abs(baseline))) } catch (err) { return { text: `baseline unreadable: ${String(err)}` } } }
    const root = resolve(rec, spec.root ?? '')
    const broot = base ? resolve(base, spec.root ?? '') : undefined
    const lines = [`record ${file}${baseline ? ` vs ${baseline}` : ''} (root ${spec.root || '.'}, ${root === undefined ? 'ROOT ABSENT' : 'ok'})`]
    let changed = 0
    for (const f of spec.fields) {
      const now = render(resolve(root, f.path), f)
      if (base) {
        const before = render(resolve(broot, f.path), f)
        if (before !== now) { changed++; lines.push(`• ${f.label}:\n    before: ${before}\n    after:  ${now}`) } else lines.push(`  ${f.label}: ${now}  (same)`)
      } else lines.push(`• ${f.label}: ${now}`)
    }
    if (base) lines.push(`${changed} of ${spec.fields.length} fields differ`)
    return { text: lines.join('\n') }
  })
}
