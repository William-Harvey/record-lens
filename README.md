# record-lens

A Claude Code plugin that summarises a JSON run record through a per-project spec, and diffs it against a baseline record. One command replaces the ad-hoc script a verification otherwise starts with.

## Why I built it

Verifying an engineering change against production records meant, every time, writing a few lines of Python over a 10 to 20 MB JSON file to pull out the same dozen things: stage timings, spend against the ceiling, which execution paths ran, per-condition counts, the served lead text. Each script consumed context, each was slightly different, and comparisons against the previous record were done by eye. A fixed, spec-driven summary makes a verification a one-liner and keeps the session's context small. Because the spec lives in the project, the plugin knows nothing about any project.

## What it does

`/record <file> [baseline]` reads the record, resolves each field of the spec under an optional root path, renders it by kind, and, with a baseline, prints `before → after` for every field that differs plus a count of changed fields.

Kinds: `value` (JSON, cut to `max` chars) · `text` (whitespace-collapsed string) · `count` (length of a list or object) · `keys` (an object's keys) · `table` (a list of objects, one line each, the `columns` named).

## Setup

`.claude/record-lens.json` in the project:

```json
{
  "root": "response.answer.provenance.gie_answer",
  "fields": [
    { "label": "timings", "path": "timings", "kind": "value", "max": 300 },
    { "label": "spend", "path": "request_budget.spend", "kind": "value" },
    { "label": "paths", "path": "interpretation.operation_results[0].paths", "kind": "keys" },
    { "label": "per-condition counts", "path": "interpretation.operation_results[0].identification.per_condition", "kind": "table", "columns": ["text", "counts"] },
    { "label": "lead", "path": "../../items[0].data.text", "kind": "text", "max": 600 }
  ]
}
```

Paths use dotted keys and `[n]` indexes. (The `..` form is not supported; put fields outside the root under their own spec entry with `root` omitted, or use two specs.)

## Why I'm sharing it

Any system that writes structured run records (evaluations, pipelines, agent runs) faces the same chore: the same dozen fields pulled out by hand, differently each time, before a change can be judged. A spec file per project turns that into one command and a stable diff. The plugin knows nothing about my records; yours are described in your spec.

## How to load it into a project

1. Install once, at the user scope, from a terminal session: `/plugin install record-lens --marketplace William-Harvey/record-lens` (answer `y` to add the marketplace, then pick the scope). From a shell: `claude plugin install record-lens --marketplace William-Harvey/record-lens`. In the desktop app: click + next to the prompt box, Plugins, Add marketplace `William-Harvey/record-lens`, then Add plugin.
2. Add the project's config file described under Setup (`.claude/record-lens.json`), committed with the project so every session and subagent sees the same values.
3. Start a session in the project; the plugin's commands appear in `/` and its hooks are active for the session and every subagent it launches.
4. To try it without installing: `claude --plugin-dir <path to this folder>`.

## Install

```
/plugin install record-lens --marketplace William-Harvey/record-lens
```

From a shell: `claude plugin install record-lens --marketplace William-Harvey/record-lens`. Desktop app: + next to the prompt box, Plugins, Add marketplace `William-Harvey/record-lens`, Add plugin. Development: `claude --plugin-dir <this folder>`.
