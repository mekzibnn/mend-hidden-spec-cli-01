// main.ts is mend, the CLI SPEC.md specifies, and this is the kit's starting point for it (MIT). It does sections 1 to 4, 9 and 10 of SPEC.md: the command line, the output and
// exit codes, safe paths, format detection, JSON edits and the all-or-nothing write. The other three formats are
// detected and then read as holding no edit, so they answer `error: parse 1`: reading unified diffs (section 6),
// SEARCH/REPLACE blocks (section 7) and V4A patches (section 8), and matching lines at three tiers (section 5), are
// yours to write. Node 22, the standard library alone; run it as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** A file's lines, its line break and whether it ends with one (SPEC.md section 3). */
function fileParts(text: string): { lines: string[]; br: string; fin: boolean } {
  if (text === '') return { lines: [], br: '\n', fin: false };
  const nl = text.indexOf('\n');
  const br = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const parts = text.split(br);
  const fin = text.endsWith(br);
  if (fin) parts.pop();
  return { lines: parts, br, fin };
}

function joinParts(lines: string[], br: string, fin: boolean): string {
  if (lines.length === 0) return '';
  return lines.join(br) + (fin ? br : '');
}

const leadingWs = (s: string): string => (/^[ \t]*/.exec(s) ?? [''])[0]!;

/** SPEC.md section 5: the three matching tiers. */
const stripTrail = (s: string): string => s.replace(/[ \t]+$/, '');
const stripBoth = (s: string): string => s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
function tierEq(tier: number, a: string, b: string): boolean {
  if (tier === 0) return a === b;
  if (tier === 1) return stripTrail(a) === stripTrail(b);
  return stripBoth(a) === stripBoth(b);
}

/** The first tier at which O occurs in lines at or after `from`, with every occurrence there. */
function findTierFrom(lines: string[], o: string[], strict: boolean, from: number): { tier: number; occ: number[] } | null {
  const top = strict ? 0 : 2;
  for (let t = 0; t <= top; t++) {
    const occ: number[] = [];
    for (let i = from; i + o.length <= lines.length; i++) {
      let ok = true;
      for (let j = 0; j < o.length; j++) {
        if (!tierEq(t, o[j]!, lines[i + j]!)) { ok = false; break; }
      }
      if (ok) occ.push(i);
    }
    if (occ.length > 0) return { tier: t, occ };
  }
  return null;
}

/** Replace O at position `at` with N. Context lines of N take the file's own matched line; at tier 2 the
 *  other lines of N are re-indented. `ctx` maps an index in N to the index in O of the same context line. */
function spliceAt(lines: string[], at: number, o: string[], n: string[], tier: number, ctx: Map<number, number>): string[] {
  const f = leadingWs(lines[at] ?? '');
  const p = leadingWs(o[0] ?? '');
  const out = lines.slice(0, at);
  for (let j = 0; j < n.length; j++) {
    const cj = ctx.get(j);
    if (cj !== undefined) { out.push(lines[at + cj]!); continue; }
    let s = n[j]!;
    if (tier === 2 && s.trim() !== '' && s.startsWith(p)) s = f + s.slice(p.length);
    out.push(s);
  }
  out.push(...lines.slice(at + o.length));
  return out;
}

/** Successful move edits, in patch order: old path -> new path. Filled in as edits run; read when printing. */
const moves: Array<{ from: string; to: string }> = [];

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }
}

type Edit = (tree: Tree) => void;

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

/* ---- SPEC.md section 6: unified diffs ---- */

type BodyLine = { k: 'ctx' | 'old' | 'new' | 'bs'; text: string };
interface Hunk { a: number; body: BodyLine[]; }

/** Whether a `\` line follows the hunk's last context or `+` line. */
function noNewlineAtEnd(body: BodyLine[]): boolean {
  let last = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i]!.k === 'ctx' || body[i]!.k === 'new') last = i;
  }
  return last >= 0 && body[last + 1]?.k === 'bs';
}

/** Apply a section's hunks, in order, to a file's text. */
function applyHunks(content: string, hunks: Hunk[], strict: boolean, path: string): string {
  let { lines, br, fin } = fileParts(content);
  let d = 0;
  for (const h of hunks) {
    const o: string[] = [];
    const n: string[] = [];
    const ctx = new Map<number, number>();
    let oi = 0;
    let ni = 0;
    for (const b of h.body) {
      if (b.k === 'bs') continue;
      if (b.k === 'ctx') { ctx.set(ni, oi); o.push(b.text); n.push(b.text); oi++; ni++; }
      else if (b.k === 'old') { o.push(b.text); oi++; }
      else { n.push(b.text); ni++; }
    }
    const noNl = noNewlineAtEnd(h.body);
    if (o.length === 0) {
      const pos = Math.min(Math.max(h.a + d, 0), lines.length);
      const atEnd = pos === lines.length;
      lines = [...lines.slice(0, pos), ...n, ...lines.slice(pos)];
      if (atEnd) fin = !noNl;
      d += n.length;
      continue;
    }
    const found = findTierFrom(lines, o, strict, 0);
    if (found === null) throw new Fail('no-match', path);
    const target = h.a - 1 + d;
    let best = found.occ[0]!;
    let bd = Math.abs(best - target);
    for (const p of found.occ) {
      const dd = Math.abs(p - target);
      if (dd < bd) { best = p; bd = dd; }
    }
    const atEnd = best + o.length === lines.length;
    lines = spliceAt(lines, best, o, n, found.tier, ctx);
    if (atEnd) fin = !noNl;
    d += n.length - o.length;
  }
  return joinParts(lines, br, fin);
}

interface UniSection {
  oldPath: string | null;
  newPath: string | null;
  isCreate: boolean;
  isDelete: boolean;
  hunks: Hunk[];
}

/** The path after the four characters of a `--- `/`+++ ` line, or null for /dev/null. */
function uniPath(line: string): string | null {
  const rest = line.slice(4);
  const tab = rest.indexOf('\t');
  let p = (tab >= 0 ? rest.slice(0, tab) : rest).trim();
  if (p === '/dev/null') return null;
  if (p.startsWith('a/')) p = p.slice(2);
  else if (p.startsWith('b/')) p = p.slice(2);
  return p;
}

function uniEdit(s: UniSection, strict: boolean): Edit {
  const oldP = s.oldPath;
  const newP = s.newPath;
  if (s.isCreate && newP !== null) {
    const plus: string[] = [];
    for (const h of s.hunks) for (const b of h.body) if (b.k === 'new') plus.push(b.text);
    let fin = true;
    let lastH: Hunk | null = null;
    let lastI = -1;
    for (const h of s.hunks) {
      for (let i = 0; i < h.body.length; i++) {
        if (h.body[i]!.k === 'new') { lastH = h; lastI = i; }
      }
    }
    if (lastH !== null) fin = lastH.body[lastI + 1]?.k !== 'bs';
    const content = plus.length === 0 ? '' : plus.join('\n') + (fin ? '\n' : '');
    return (tree) => {
      if (!safe(newP)) throw new Fail('unsafe', newP);
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      tree.now.set(newP, content);
    };
  }
  if (s.isDelete && oldP !== null) {
    return (tree) => {
      if (!safe(oldP)) throw new Fail('unsafe', oldP);
      if (tree.get(oldP) === null) throw new Fail('missing', oldP);
      tree.now.set(oldP, null);
    };
  }
  if (oldP !== null && newP !== null && oldP !== newP) {
    return (tree) => {
      if (!safe(oldP)) throw new Fail('unsafe', oldP);
      if (!safe(newP)) throw new Fail('unsafe', newP);
      const before = tree.get(oldP);
      if (before === null) throw new Fail('missing', oldP);
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      const out = applyHunks(before, s.hunks, strict, oldP);
      tree.now.set(newP, out);
      tree.now.set(oldP, null);
      moves.push({ from: oldP, to: newP });
    };
  }
  if (oldP !== null) {
    return (tree) => {
      if (!safe(oldP)) throw new Fail('unsafe', oldP);
      const before = tree.get(oldP);
      if (before === null) throw new Fail('missing', oldP);
      tree.now.set(oldP, applyHunks(before, s.hunks, strict, oldP));
    };
  }
  // Degenerate section (both paths /dev/null): nothing to do, still one edit.
  return () => {};
}

interface UniHead {
  pairOld: string | null | undefined;
  pairNew: string | null | undefined;
  renFrom: string | undefined;
  renTo: string | undefined;
  gitOld: string | undefined;
  gitNew: string | undefined;
  newMode: boolean;
  delMode: boolean;
}

function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const sections: UniSection[] = [];
  let cur: UniSection | null = null;
  let head: UniHead | null = null;
  let curHunk: Hunk | null = null;
  let state: 'out' | 'head' | 'body' | 'between' = 'out';

  const newHead = (): UniHead => ({ pairOld: undefined, pairNew: undefined, renFrom: undefined, renTo: undefined, gitOld: undefined, gitNew: undefined, newMode: false, delMode: false });
  const closeHunk = (): void => {
    if (curHunk === null) return;
    while (curHunk.body.length > 0) {
      const b = curHunk.body[curHunk.body.length - 1]!;
      if (b.k === 'ctx' && b.text === '') curHunk.body.pop();
      else break;
    }
    cur!.hunks.push(curHunk);
    curHunk = null;
  };
  const closeSection = (): void => {
    closeHunk();
    if (cur !== null && head !== null) {
      const oldPath = head.pairOld !== undefined ? head.pairOld : head.renFrom !== undefined ? head.renFrom : head.gitOld;
      const newPath = head.pairNew !== undefined ? head.pairNew : head.renTo !== undefined ? head.renTo : head.gitNew;
      cur.oldPath = oldPath === undefined ? '' : oldPath;
      cur.newPath = newPath === undefined ? '' : newPath;
      cur.isCreate = cur.oldPath === null || head.newMode;
      cur.isDelete = cur.newPath === null || head.delMode;
      sections.push(cur);
    }
    cur = null;
    head = null;
    state = 'out';
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (state === 'body') {
      if (line.startsWith('diff --git ') || (line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ '))) {
        closeHunk();
        state = 'between';
        continue;
      }
      if (line === '' || line[0] === ' ' || line[0] === '-' || line[0] === '+' || line[0] === '\\') {
        const b: BodyLine = line === '' ? { k: 'ctx', text: '' }
          : line[0] === ' ' ? { k: 'ctx', text: line.slice(1) }
          : line[0] === '-' ? { k: 'old', text: line.slice(1) }
          : line[0] === '+' ? { k: 'new', text: line.slice(1) }
          : { k: 'bs', text: line.slice(1) };
        curHunk!.body.push(b);
        i++;
        continue;
      }
      closeHunk();
      state = 'between';
      continue;
    }
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/([^ \t]+) b\/([^ \t]+)[ \t]*$/.exec(line);
      if (m === null) throw new Exit2(`error: parse ${i + 1}`);
      closeSection();
      cur = { oldPath: '', newPath: '', isCreate: false, isDelete: false, hunks: [] };
      head = newHead();
      head.gitOld = m[1]!;
      head.gitNew = m[2]!;
      state = 'head';
      i++;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m === null) throw new Exit2(`error: parse ${i + 1}`);
      if (cur === null) throw new Exit2(`error: parse ${i + 1}`);
      closeHunk();
      curHunk = { a: parseInt(m[1]!, 10), body: [] };
      state = 'body';
      i++;
      continue;
    }
    const nextPlus = (lines[i + 1] ?? '').startsWith('+++ ');
    if (line.startsWith('--- ') && nextPlus) {
      if (state !== 'head' || head!.pairOld !== undefined) {
        closeSection();
        cur = { oldPath: '', newPath: '', isCreate: false, isDelete: false, hunks: [] };
        head = newHead();
        state = 'head';
      }
      head!.pairOld = uniPath(line);
      head!.pairNew = uniPath(lines[i + 1]!);
      i += 2;
      continue;
    }
    if (line.startsWith('--- ')) {
      if (state === 'head') throw new Exit2(`error: parse ${i + 2}`);
      i++;
      continue;
    }
    if (state === 'head' && head !== null) {
      if (line.startsWith('rename from ')) head.renFrom = line.slice(12).trim();
      else if (line.startsWith('rename to ')) head.renTo = line.slice(10).trim();
      else if (line === 'new file mode' || line.startsWith('new file mode ')) head.newMode = true;
      else if (line === 'deleted file mode' || line.startsWith('deleted file mode ')) head.delMode = true;
      else if (line.startsWith('+++ ')) head.pairNew = uniPath(line);
      i++;
      continue;
    }
    i++;
  }
  closeSection();
  return sections.map((s) => uniEdit(s, strict));
}

/* ---- SPEC.md section 7: SEARCH/REPLACE blocks ---- */

function srEdit(path: string, oldLines: string[], newLines: string[], strict: boolean): Edit {
  if (oldLines.length === 0) {
    const content = newLines.length === 0 ? '' : newLines.join('\n') + '\n';
    return (tree) => {
      if (!safe(path)) throw new Fail('unsafe', path);
      if (tree.get(path) !== null) throw new Fail('exists', path);
      tree.now.set(path, content);
    };
  }
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    const { lines, br, fin } = fileParts(before);
    const found = findTierFrom(lines, oldLines, strict, 0);
    if (found === null) throw new Fail('no-match', path);
    if (found.occ.length > 1) throw new Fail('ambiguous', path);
    const out = spliceAt(lines, found.occ[0]!, oldLines, newLines, found.tier, new Map());
    tree.now.set(path, joinParts(out, br, fin));
  };
}

function srEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let prevEnd = -1;
  let prevPath: string | null = null;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trimEnd() !== '<<<<<<< SEARCH') { i++; continue; }
    const s = i;
    let path: string | null = null;
    for (let j = s - 1; j > prevEnd; j--) {
      const l = lines[j]!;
      if (blank(l)) continue;
      if (l.trim().startsWith('```')) continue;
      path = l.trim();
      break;
    }
    if (path === null) path = prevPath;
    if (path === null) throw new Exit2(`error: parse ${s + 1}`);
    let e1 = -1;
    for (let j = s + 1; j < lines.length; j++) {
      if (lines[j]!.trimEnd() === '=======') { e1 = j; break; }
    }
    if (e1 < 0) throw new Exit2(`error: parse ${s + 1}`);
    let e2 = -1;
    for (let j = e1 + 1; j < lines.length; j++) {
      if (lines[j]!.trimEnd() === '>>>>>>> REPLACE') { e2 = j; break; }
    }
    if (e2 < 0) throw new Exit2(`error: parse ${s + 1}`);
    edits.push(srEdit(path, lines.slice(s + 1, e1), lines.slice(e1 + 1, e2), strict));
    prevPath = path;
    prevEnd = e2;
    i = e2 + 1;
  }
  return edits;
}

/* ---- SPEC.md section 8: V4A patches ---- */

interface VChunk { anchor: string | null; eof: boolean; body: Array<{ k: 'ctx' | 'old' | 'new'; text: string }>; }

function v4aAddEdit(path: string, flines: string[]): Edit {
  const content = flines.length === 0 ? '' : flines.join('\n') + '\n';
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (tree.get(path) !== null) throw new Fail('exists', path);
    tree.now.set(path, content);
  };
}

function v4aDelEdit(path: string): Edit {
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (tree.get(path) === null) throw new Fail('missing', path);
    tree.now.set(path, null);
  };
}

function v4aUpdateEdit(path: string, moveTo: string | null, chunks: VChunk[], strict: boolean): Edit {
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    if (moveTo !== null) {
      if (!safe(moveTo)) throw new Fail('unsafe', moveTo);
      if (tree.get(moveTo) !== null) throw new Fail('exists', moveTo);
    }
    let { lines, br, fin } = fileParts(before);
    let cursor = 0;
    for (const ch of chunks) {
      if (ch.anchor !== null) {
        const found = findTierFrom(lines, [ch.anchor], strict, cursor);
        if (found === null) throw new Fail('no-match', path);
        cursor = found.occ[0]! + 1;
      }
      const o: string[] = [];
      const n: string[] = [];
      const ctx = new Map<number, number>();
      let oi = 0;
      let ni = 0;
      for (const b of ch.body) {
        if (b.k === 'ctx') { ctx.set(ni, oi); o.push(b.text); n.push(b.text); oi++; ni++; }
        else if (b.k === 'old') { o.push(b.text); oi++; }
        else { n.push(b.text); ni++; }
      }
      if (o.length === 0) {
        const pos = ch.eof ? lines.length : cursor;
        lines = [...lines.slice(0, pos), ...n, ...lines.slice(pos)];
        cursor = pos + n.length;
        continue;
      }
      if (ch.eof) {
        const pos = lines.length - o.length;
        if (pos < cursor) throw new Fail('no-match', path);
        let tier = -1;
        const top = strict ? 0 : 2;
        for (let t = 0; t <= top; t++) {
          let ok = true;
          for (let j = 0; j < o.length; j++) {
            if (!tierEq(t, o[j]!, lines[pos + j]!)) { ok = false; break; }
          }
          if (ok) { tier = t; break; }
        }
        if (tier < 0) throw new Fail('no-match', path);
        lines = spliceAt(lines, pos, o, n, tier, ctx);
        cursor = pos + n.length;
        continue;
      }
      const found = findTierFrom(lines, o, strict, cursor);
      if (found === null) throw new Fail('no-match', path);
      const at = found.occ[0]!;
      lines = spliceAt(lines, at, o, n, found.tier, ctx);
      cursor = at + n.length;
    }
    const out = joinParts(lines, br, fin);
    if (moveTo !== null) {
      tree.now.set(moveTo, out);
      tree.now.set(path, null);
      moves.push({ from: path, to: moveTo });
    } else {
      tree.now.set(path, out);
    }
  };
}

function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = lines.length - 1;
  while (last >= 0 && blank(lines[last]!)) last--;
  if (lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const edits: Edit[] = [];
  const isSectionStart = (l: string): boolean =>
    l.startsWith('*** Add File:') || l.startsWith('*** Delete File:') || l.startsWith('*** Update File:');
  let i = first + 1;
  while (i < last) {
    const line = lines[i]!;
    if (blank(line)) { i++; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^\*\*\* Add File:(.*)$/.exec(line)) !== null) {
      const path = m[1]!.trim();
      i++;
      const flines: string[] = [];
      while (i < last) {
        const l = lines[i]!;
        if (l === '') { flines.push(''); i++; continue; }
        if (l.startsWith('+')) { flines.push(l.slice(1)); i++; continue; }
        break;
      }
      while (flines.length > 0 && flines[flines.length - 1] === '') flines.pop();
      edits.push(v4aAddEdit(path, flines));
      continue;
    }
    if ((m = /^\*\*\* Delete File:(.*)$/.exec(line)) !== null) {
      const path = m[1]!.trim();
      i++;
      while (i < last) {
        const l = lines[i]!;
        if (blank(l)) { i++; continue; }
        if (isSectionStart(l)) break;
        throw new Exit2(`error: parse ${i + 1}`);
      }
      edits.push(v4aDelEdit(path));
      continue;
    }
    if ((m = /^\*\*\* Update File:(.*)$/.exec(line)) !== null) {
      const path = m[1]!.trim();
      const updateLine = i + 1;
      i++;
      let moveTo: string | null = null;
      const chunks: VChunk[] = [];
      let cur: VChunk | null = null;
      const closeChunk = (): void => { if (cur !== null) { chunks.push(cur); cur = null; } };
      while (i < last) {
        const l = lines[i]!;
        if (isSectionStart(l)) break;
        if (blank(l)) {
          if (cur !== null) cur.body.push({ k: 'ctx', text: '' });
          i++;
          continue;
        }
        if (l[0] === ' ' || l[0] === '-' || l[0] === '+') {
          if (cur === null) {
            if (chunks.length > 0) throw new Exit2(`error: parse ${i + 1}`);
            cur = { anchor: null, eof: false, body: [] };
          }
          cur.body.push(l[0] === ' ' ? { k: 'ctx', text: l.slice(1) } : l[0] === '-' ? { k: 'old', text: l.slice(1) } : { k: 'new', text: l.slice(1) });
          i++;
          continue;
        }
        if (l.startsWith('*** Move to:')) {
          if (moveTo !== null || chunks.length > 0 || cur !== null) throw new Exit2(`error: parse ${i + 1}`);
          moveTo = l.slice(12).trim();
          i++;
          continue;
        }
        if (l.trim() === '*** End of File') {
          if (cur !== null) { cur.eof = true; closeChunk(); }
          else chunks.push({ anchor: null, eof: true, body: [] });
          i++;
          continue;
        }
        if (l.startsWith('@@')) {
          closeChunk();
          const a = l.slice(2).trim();
          cur = { anchor: a === '' ? null : a, eof: false, body: [] };
          i++;
          continue;
        }
        throw new Exit2(`error: parse ${i + 1}`);
      }
      closeChunk();
      if (chunks.length > 0) {
        const lc = chunks[chunks.length - 1]!;
        while (lc.body.length > 0) {
          const b = lc.body[lc.body.length - 1]!;
          if (b.k === 'ctx' && b.text === '') lc.body.pop();
          else break;
        }
      }
      if (chunks.length === 0 && moveTo === null) throw new Exit2(`error: parse ${updateLine}`);
      edits.push(v4aUpdateEdit(path, moveTo, chunks, strict));
      continue;
    }
    throw new Exit2(`error: parse ${i + 1}`);
  }
  return edits;
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    edits = kind === 'json' ? jsonEdits(text, lines)
      : kind === 'unified' ? unifiedEdits(lines, strict)
      : kind === 'search-replace' ? srEdits(lines, strict)
      : v4aEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  moves.length = 0;
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    const mvLen = moves.length;
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      moves.length = mvLen;
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const entries: Array<{ key: string; line: string }> = [];
  for (const p of [...tree.now.keys()]) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    entries.push({ key: p, line: `${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}` });
  }
  const seenMoves = new Set<string>();
  for (const mv of moves) {
    const id = `${mv.from}\0${mv.to}`;
    if (seenMoves.has(id)) continue;
    seenMoves.add(id);
    const wasOld = tree.original(mv.from);
    const nowOld = tree.get(mv.from);
    const wasNew = tree.original(mv.to);
    const nowNew = tree.get(mv.to);
    if (wasOld !== null && nowOld === null && wasNew === null && nowNew !== null) {
      const di = entries.findIndex((e) => e.line === `D ${mv.from}`);
      if (di >= 0) entries.splice(di, 1);
      const ai = entries.findIndex((e) => e.line === `A ${mv.to}`);
      if (ai >= 0) entries.splice(ai, 1);
      entries.push({ key: mv.to, line: `R ${mv.from} -> ${mv.to}` });
    }
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  const rows = entries.map((e) => e.line);
  if (!check) {
    for (const p of [...tree.now.keys()]) {
      const was = tree.original(p);
      const now = tree.now.get(p)!;
      if (was === now) continue;
      if (now === null) rmSync(p, { force: true });
      else {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, now);
      }
    }
  }
  return { code: 0, out: [...rows, `ok: ${rows.length} ${rows.length === 1 ? 'file' : 'files'}`] };
}


const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
