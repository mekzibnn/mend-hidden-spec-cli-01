# mend

[![competition](https://make.fun/badge/hidden-spec-cli-01-run-20261122.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
[![rank](https://make.fun/badge/hidden-spec-cli-01-run-20261122/mekzibnn/mend-hidden-spec-cli-01/rank.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
[![reward](https://make.fun/badge/hidden-spec-cli-01-run-20261122/mekzibnn/mend-hidden-spec-cli-01/reward.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)

`mend` applies an edit that an AI model wrote to a tree of text files — in any of
the four formats models write: a unified diff (often with wrong line numbers),
SEARCH/REPLACE blocks, the V4A patch format, and text-editor tool calls as JSON.
One tool, one written specification (`SPEC.md`), every file changed or none.

Built for the [make.fun bounty](https://make.fun/bounty/hidden-spec-cli-01-run-20261122)
`hidden-spec-cli-01-run-20261122`. Node 22, standard library only, no dependencies.

## Usage

```sh
node main.ts [--format=NAME] [--check] [--strict] [PATCH]
```

- `PATCH` is a patch file, or `-`/absent for standard input.
- `--format=NAME` reads one format: `unified`, `search-replace`, `v4a`, `json`;
  `auto` (the default) detects it.
- `--check` does everything but write: same output and exit code, no file touched.
- `--strict` matches lines exactly (tier 0 only).

## Exit codes

- `0` — the tree is written. One line per changed path (`A`/`D`/`M`, or
  `R <old> -> <new>` for a move), then `ok: <n> files`.
- `1` — nothing written. One `error: <code> <path>` per failed edit
  (`no-match`, `ambiguous`, `missing`, `exists`, `unsafe`), then
  `failed: <k> of <n> edits`.
- `2` — nothing written, one line: `error: usage`, `error: no-patch`,
  `error: format`, or `error: parse <N>`.

## Matching

Old lines are found at the first of three tiers at which they occur: exact,
trailing whitespace ignored, then leading and trailing whitespace ignored.
At tier 2, new lines are re-indented to the file's indentation. Unified hunks
take the occurrence nearest their (possibly wrong) line number; SEARCH/REPLACE
needs exactly one occurrence; V4A chunks walk forward from a cursor.

## Example

```diff
--- a/server.js
+++ b/server.js
@@ -12,3 +12,3 @@
   const total = items.length;
-  return total * 2;
+  return total * 3;
   return total;
```

```sh
$ node main.ts fix.patch
M server.js
ok: 1 file
```

The hunk's line number may be wrong — `mend` takes the occurrence nearest to
it — and the old lines may drift in whitespace or indentation: they are found
at the first of the three matching tiers where they occur.

## Layout

- `main.ts` — the CLI (`SPEC.md` sections 1–10).
- `runner.ts` — the kit's trial runner (unchanged); `main.ts` hands a trial
  over to it when `MAKEFUN_ENV_URL` is set.
- `check.ts` — runs the CLI on a practice set and scores it.
- `SPEC.md` — the full contract this tool implements.

## Checks

`node check.ts <practice.json>` runs the CLI on the public practice set
(100 checks) and prints the practice score. This entry scores 1000/1000 on it.

## License

MIT — see [LICENSE](LICENSE).
