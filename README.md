# mend

[![competition](https://make.fun/badge/hidden-spec-cli-01-run-20261122.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
[![rank](https://make.fun/badge/hidden-spec-cli-01-run-20261122/mekzibnn/mend-hidden-spec-cli-01/rank.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
[![reward](https://make.fun/badge/hidden-spec-cli-01-run-20261122/mekzibnn/mend-hidden-spec-cli-01/reward.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)

`mend` is a small CLI that applies an AI-written edit to a tree of text files,
exactly as written in `SPEC.md`. One invocation, one patch, four formats:

- **unified diff** — `diff --git` / `---` / `+++` sections with `@@` hunks,
  including creates, deletes, and renames.
- **SEARCH/REPLACE** — `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` blocks.
- **V4A** — `*** Begin Patch` / `*** Add File` / `*** Delete File` /
  `*** Update File` with `@@` chunks and `*** Move to:`.
- **JSON** — an array of tool-call objects, or one JSON object per line
  (`create`, `str_replace`, `insert`).

It is built for the [make.fun bounty](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
`hidden-spec-cli-01-run-20261122`. Node 22, standard library only, no
dependencies, no network.

## Usage

```sh
node main.ts [--format=NAME] [--check] [--strict] [PATCH]
```

- `PATCH` is a patch file; `-` or no argument reads standard input.
- `--format=NAME` forces one format: `unified`, `search-replace`, `v4a`,
  `json`. The default `auto` detects the format from the patch itself.
- `--check` runs everything but writes nothing: same output, same exit code.
- `--strict` matches lines exactly (tier 0 only); without it, matches fall
  back to ignoring trailing whitespace (tier 1) and then leading and
  trailing whitespace (tier 2, with re-indentation of the new lines).

## Exit codes and output

- `0` — the patch applied. One line per changed path, in UTF-8 byte order:
  `A <path>`, `D <path>`, `M <path>`, or `R <old> -> <new>` for a move,
  then `ok: <n> files` (or `ok: 1 file`).
- `1` — some edits failed. One `error: <code> <path>` line per failed edit,
  in patch order, then `failed: <k> of <n> edits`. Nothing is written.
- `2` — the invocation or the patch itself is wrong: `error: usage`,
  `error: no-patch`, `error: format`, or `error: parse <line>`.

## How it applies a patch

- **All or nothing.** Edits apply in patch order to an in-memory tree; if
  any edit fails, no file on disk changes. Later edits still run after a
  failure, so every failure is reported.
- **Three-tier matching.** A block of old lines matches at the first tier
  that has exactly one occurrence: exact, then ignoring trailing
  whitespace, then ignoring leading and trailing whitespace. Unified hunks
  instead take the occurrence nearest to the hunk's stated line number
  (ties go to the earlier one); empty old blocks insert at the stated
  position. V4A chunks scan forward from a cursor, so a chunk can only
  match at or after the previous chunk.
- **Line endings are the file's own.** A changed file keeps its CRLF/LF
  break and its final line break (unless the hunk reaches the end of the
  file and says otherwise); created files are LF with a final break unless
  the format says otherwise; JSON creates are written byte-for-byte.
- **Paths are checked first.** Every path is checked for safety (no
  leading `/`, no `\`, no empty/`.`/`..` segments) before anything else
  about it, and a failed edit never changes the tree.

## Verified against

- Practice set: 100 of 100 checks pass (`node check.ts
  ../program/generator/practice.json`, score 1000).
- Trials 0, 1, and 2: 100 of 100 each.
- 110 self-made edge cases covering the corners the practice set does not:
  `\ No newline at end of file` on creates and changes, empty old blocks
  inserted at the start/middle/end, tier-2 re-indentation in unified and
  SEARCH/REPLACE, CRLF files, V4A end-of-file chunks / pure moves / two
  chunks, JSON Lines and arrays, `--check` / `--strict`, usage errors,
  unsafe paths, all-or-nothing writes, and UTF-8 path ordering.

## Files

- `main.ts` — the whole tool.
- `runner.ts` — the kit's harness entry point (as shipped).
- `SPEC.md` — the written specification this implements.
