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

// ---------------------------------------------------------------------------
// Sections 5 to 8: matching lines, unified diffs, SEARCH/REPLACE blocks, V4A.
// ---------------------------------------------------------------------------

interface FileState {
  lines: string[];
  br: '\n' | '\r\n';
  final: boolean;
}

function parseFile(text: string): FileState {
  if (text === '') return { lines: [], br: '\n', final: false };
  const nl = text.indexOf('\n');
  const br: '\n' | '\r\n' = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const parts = text.split(br);
  const final = text.endsWith(br);
  if (final) parts.pop();
  return { lines: parts, br, final };
}

function renderFile(f: FileState): string {
  if (f.lines.length === 0) return '';
  return f.lines.join(f.br) + (f.final ? f.br : '');
}

const stripTrail = (s: string): string => s.replace(/[ \t]+$/, '');
const stripBoth = (s: string): string => s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
const leadWs = (s: string): string => {
  const m = /^[ \t]*/.exec(s);
  return m === null ? '' : m[0];
};

function lineEq(a: string, b: string, tier: number): boolean {
  if (tier === 0) return a === b;
  if (tier === 1) return stripTrail(a) === stripTrail(b);
  return stripBoth(a) === stripBoth(b);
}

/** Positions i >= from where O's lines match f's lines at tier. */
function occurrences(o: string[], f: string[], tier: number, from: number): number[] {
  const out: number[] = [];
  for (let i = from; i + o.length <= f.length; i++) {
    let ok = true;
    for (let k = 0; k < o.length; k++) {
      if (!lineEq(o[k]!, f[i + k]!, tier)) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

interface Found {
  tier: number;
  pos: number[];
}

/** First tier (0, or 0-2 unless strict) with an occurrence at or after from. */
function findTier(o: string[], f: string[], strict: boolean, from = 0): Found | null {
  const tiers = strict ? [0] : [0, 1, 2];
  for (const t of tiers) {
    const pos = occurrences(o, f, t, from);
    if (pos.length > 0) return { tier: t, pos };
  }
  return null;
}

/** A new line: ctx >= 0 means it is a context line, the file's own O[ctx] line. */
interface NewLine {
  text: string;
  ctx: number;
}

/** Build N's lines: context lines are the file's own matched lines; at tier 2 the
 *  other lines are re-indented from O's first line's indent to the file's. */
function buildNew(o: string[], n: NewLine[], fileLines: string[], pos: number, tier: number): string[] {
  const out: string[] = [];
  if (o.length > 0 && tier === 2) {
    const F = leadWs(fileLines[pos] ?? '');
    const P = leadWs(o[0]!);
    for (const e of n) {
      if (e.ctx >= 0) { out.push(fileLines[pos + e.ctx]!); continue; }
      const t = e.text;
      out.push(t !== '' && t.trim() !== '' && t.startsWith(P) ? F + t.slice(P.length) : t);
    }
    return out;
  }
  for (const e of n) out.push(e.ctx >= 0 ? fileLines[pos + e.ctx]! : e.text);
  return out;
}

/** O and N of a hunk/chunk body; noBreak: a `\` line follows its last context or
 *  `+` line; plusNoBreak: one follows its last `+` line. */
interface ON {
  o: string[];
  n: NewLine[];
  noBreak: boolean;
  plusNoBreak: boolean;
}

function bodyON(body: string[]): ON {
  const o: string[] = [];
  const n: NewLine[] = [];
  let lastCtxPlus = -1;
  let lastPlus = -1;
  for (let j = 0; j < body.length; j++) {
    const b = body[j]!;
    if (b === '' || b.startsWith(' ')) {
      o.push(b.slice(1));
      n.push({ text: b.slice(1), ctx: o.length - 1 });
      lastCtxPlus = j;
    } else if (b.startsWith('-')) {
      o.push(b.slice(1));
    } else if (b.startsWith('+')) {
      n.push({ text: b.slice(1), ctx: -1 });
      lastCtxPlus = j;
      lastPlus = j;
    }
  }
  const after = (j: number): boolean => j >= 0 && body[j + 1] !== undefined && body[j + 1]!.startsWith('\\');
  return { o, n, noBreak: after(lastCtxPlus), plusNoBreak: after(lastPlus) };
}

/** Apply a section's hunks to a file's text (SPEC section 6). Throws Fail no-match. */
function applyHunks(text: string, hunks: { a: number; body: string[] }[], strict: boolean, path: string): string {
  const f = parseFile(text);
  let lines = f.lines;
  let final = f.final;
  let d = 0;
  for (const h of hunks) {
    const { o, n, noBreak } = bodyON(h.body);
    if (o.length === 0) {
      const idx = Math.max(0, Math.min(h.a + d, lines.length));
      const atEnd = idx === lines.length;
      const ins = n.map((e) => e.text);
      lines = [...lines.slice(0, idx), ...ins, ...lines.slice(idx)];
      if (atEnd) final = !noBreak;
      d += n.length;
    } else {
      const found = findTier(o, lines, strict);
      if (found === null) throw new Fail('no-match', path);
      const target = h.a - 1 + d;
      let pos = found.pos[0]!;
      for (const p of found.pos) {
        if (Math.abs(p - target) < Math.abs(pos - target)) pos = p;
      }
      const touchesEOF = pos + o.length === lines.length;
      const newLines = buildNew(o, n, lines, pos, found.tier);
      lines = [...lines.slice(0, pos), ...newLines, ...lines.slice(pos + o.length)];
      if (touchesEOF) final = !noBreak;
      d += n.length - o.length;
    }
  }
  return renderFile({ lines, br: f.br, final });
}

interface Move {
  old: string;
  neu: string;
}

interface Hunk {
  a: number;
  body: string[];
}

interface Section {
  oldPath: string | null;
  newPath: string | null;
  create: boolean;
  del: boolean;
  hunks: Hunk[];
  pairSeen: boolean;
}

const stripAB = (p: string): string => (p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p);

/** `/dev/null` names no file. */
const devNull = (p: string): string | null => (p === '/dev/null' ? null : p);

function dashPath(l: string): string | null {
  return devNull(stripAB(l.slice(4).split('\t')[0]!.trim()));
}

function sectionEdit(sec: Section, strict: boolean, moves: Move[]): Edit {
  return (tree) => {
    const oldP = sec.oldPath;
    const newP = sec.newPath;
    if (oldP !== null && !safe(oldP)) throw new Fail('unsafe', oldP);
    if (newP !== null && !safe(newP)) throw new Fail('unsafe', newP);
    if (sec.create || oldP === null) {
      if (newP === null) throw new Fail('unsafe', '/dev/null');
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      const out: string[] = [];
      let noBreak = false;
      for (const h of sec.hunks) {
        const { n, plusNoBreak } = bodyON(h.body);
        let hasPlus = false;
        for (const e of n) {
          if (e.ctx === -1) { out.push(e.text); hasPlus = true; }
        }
        if (hasPlus) noBreak = plusNoBreak;
      }
      tree.now.set(newP, out.length === 0 ? '' : out.join('\n') + (noBreak ? '' : '\n'));
      return;
    }
    if (sec.del || newP === null) {
      if (oldP === null) throw new Fail('unsafe', '/dev/null');
      if (tree.get(oldP) === null) throw new Fail('missing', oldP);
      tree.now.set(oldP, null);
      return;
    }
    if (oldP !== newP) {
      if (tree.get(oldP) === null) throw new Fail('missing', oldP);
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      const result = applyHunks(tree.get(oldP)!, sec.hunks, strict, oldP);
      tree.now.set(newP, result);
      tree.now.set(oldP, null);
      moves.push({ old: oldP, neu: newP });
      return;
    }
    if (tree.get(oldP) === null) throw new Fail('missing', oldP);
    tree.now.set(oldP, applyHunks(tree.get(oldP)!, sec.hunks, strict, oldP));
  };
}

/** Parse the rest of one unified section (header lines, then hunks); returns the
 *  index of the next section's start, or lines.length. */
function parseUnifiedSection(lines: string[], i: number, sec: Section): number {
  const n = lines.length;
  let inHeader = true;
  while (i < n) {
    const l = lines[i]!;
    if (l.startsWith('diff --git ')) break;
    if (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      if (inHeader && !sec.pairSeen) {
        sec.oldPath = dashPath(l);
        sec.newPath = dashPath(lines[i + 1]!);
        sec.pairSeen = true;
        i += 2;
        continue;
      }
      break;
    }
    if (l.startsWith('@@')) {
      inHeader = false;
      const hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
      if (hm === null) throw new Exit2(`error: parse ${i + 1}`);
      const a = parseInt(hm[1]!, 10);
      i++;
      const body: string[] = [];
      while (i < n) {
        const b = lines[i]!;
        if (b.startsWith('diff --git ')) break;
        if (b.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) break;
        if (b === '' || b.startsWith(' ') || b.startsWith('-') || b.startsWith('+') || b.startsWith('\\')) {
          body.push(b);
          i++;
        } else break;
      }
      while (body.length > 0 && (body[body.length - 1] === '' || body[body.length - 1] === ' ')) body.pop();
      sec.hunks.push({ a, body });
      continue;
    }
    if (inHeader) {
      if (l.startsWith('--- ')) throw new Exit2(`error: parse ${i + 2}`);
      if (l.startsWith('rename from ') && !sec.pairSeen) sec.oldPath = devNull(l.slice('rename from '.length).trim());
      else if (l.startsWith('rename to ') && !sec.pairSeen) sec.newPath = devNull(l.slice('rename to '.length).trim());
      else if (l.startsWith('new file mode')) sec.create = true;
      else if (l.startsWith('deleted file mode')) sec.del = true;
      i++;
      continue;
    }
    i++;
  }
  return i;
}

function unifiedEdits(lines: string[], strict: boolean, moves: Move[]): Edit[] {
  const edits: Edit[] = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const l = lines[i]!;
    if (l.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(l);
      if (m === null) throw new Exit2(`error: parse ${i + 1}`);
      const sec: Section = { oldPath: devNull(m[1]!), newPath: devNull(m[2]!), create: false, del: false, hunks: [], pairSeen: false };
      i = parseUnifiedSection(lines, i + 1, sec);
      edits.push(sectionEdit(sec, strict, moves));
    } else if (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      const sec: Section = { oldPath: dashPath(l), newPath: dashPath(lines[i + 1]!), create: false, del: false, hunks: [], pairSeen: true };
      i = parseUnifiedSection(lines, i + 2, sec);
      edits.push(sectionEdit(sec, strict, moves));
    } else if (l.startsWith('@@')) {
      throw new Exit2(`error: parse ${i + 1}`);
    } else {
      i++;
    }
  }
  return edits;
}

function srEdit(path: string, oldLines: string[], newLines: string[], strict: boolean): Edit {
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (oldLines.length === 0) {
      if (tree.get(path) !== null) throw new Fail('exists', path);
      tree.now.set(path, newLines.length === 0 ? '' : newLines.join('\n') + '\n');
      return;
    }
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    const f = parseFile(before);
    const found = findTier(oldLines, f.lines, strict);
    if (found === null) throw new Fail('no-match', path);
    if (found.pos.length > 1) throw new Fail('ambiguous', path);
    const pos = found.pos[0]!;
    const newL = buildNew(oldLines, newLines.map((t) => ({ text: t, ctx: -1 })), f.lines, pos, found.tier);
    const lines = [...f.lines.slice(0, pos), ...newL, ...f.lines.slice(pos + oldLines.length)];
    tree.now.set(path, renderFile({ lines, br: f.br, final: f.final }));
  };
}

function srEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let i = 0;
  let prevPath: string | null = null;
  let prevEnd = -1;
  while (i < lines.length) {
    if (lines[i]!.trimEnd() === '<<<<<<< SEARCH') {
      const s = i;
      let eq = -1;
      for (let j = s + 1; j < lines.length; j++) {
        if (lines[j]!.trimEnd() === '=======') { eq = j; break; }
        if (lines[j]!.trimEnd() === '>>>>>>> REPLACE') break;
      }
      if (eq < 0) throw new Exit2(`error: parse ${s + 1}`);
      let rep = -1;
      for (let j = eq + 1; j < lines.length; j++) {
        if (lines[j]!.trimEnd() === '>>>>>>> REPLACE') { rep = j; break; }
      }
      if (rep < 0) throw new Exit2(`error: parse ${s + 1}`);
      let path: string | null = null;
      for (let j = s - 1; j > prevEnd; j--) {
        const t = lines[j]!;
        if (blank(t)) continue;
        if (t.trim().startsWith('```')) continue;
        path = t.trim();
        break;
      }
      if (path === null) path = prevPath;
      if (path === null) throw new Exit2(`error: parse ${s + 1}`);
      prevPath = path;
      prevEnd = rep;
      edits.push(srEdit(path, lines.slice(s + 1, eq), lines.slice(eq + 1, rep), strict));
      i = rep + 1;
    } else {
      i++;
    }
  }
  return edits;
}

interface Chunk {
  anchor: string;
  eof: boolean;
  body: string[];
}

function v4aAdd(path: string, body: string[], bodyStart: number): Edit {
  const content: string[] = [];
  for (let j = 0; j < body.length; j++) {
    const l = body[j]!;
    if (l === '') content.push('');
    else if (l.startsWith('+')) content.push(l.slice(1));
    else throw new Exit2(`error: parse ${bodyStart + j + 1}`);
  }
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (tree.get(path) !== null) throw new Fail('exists', path);
    tree.now.set(path, content.length === 0 ? '' : content.join('\n') + '\n');
  };
}

function v4aUpdate(path: string, body: string[], bodyStart: number, updateLine: number, strict: boolean, moves: Move[]): Edit {
  let moveTo: string | null = null;
  let idx = 0;
  if (body.length > 0 && body[0]!.startsWith('*** Move to: ')) {
    moveTo = body[0]!.slice('*** Move to: '.length).trim();
    idx = 1;
  }
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  for (; idx < body.length; idx++) {
    const l = body[idx]!;
    const lineNo = bodyStart + idx + 1;
    if (l.startsWith('@@')) {
      if (cur !== null) chunks.push(cur);
      cur = { anchor: l.slice(2).trim(), eof: false, body: [] };
    } else if (l === '*** End of File') {
      if (cur === null) throw new Exit2(`error: parse ${lineNo}`);
      cur.eof = true;
      chunks.push(cur);
      cur = null;
    } else if (l === '' || l.startsWith(' ') || l.startsWith('-') || l.startsWith('+')) {
      if (cur === null) {
        if (chunks.length > 0) throw new Exit2(`error: parse ${lineNo}`);
        cur = { anchor: '', eof: false, body: [] };
      }
      cur.body.push(l);
    } else {
      throw new Exit2(`error: parse ${lineNo}`);
    }
  }
  if (cur !== null) chunks.push(cur);
  if (chunks.length === 0 && moveTo === null) throw new Exit2(`error: parse ${updateLine}`);
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (moveTo !== null && !safe(moveTo)) throw new Fail('unsafe', moveTo);
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    if (moveTo !== null && tree.get(moveTo) !== null) throw new Fail('exists', moveTo);
    const f = parseFile(before);
    let lines = f.lines;
    let cursor = 0;
    for (const ch of chunks) {
      if (ch.anchor !== '') {
        const tiers = strict ? [0] : [0, 1, 2];
        let found: number | null = null;
        for (const t of tiers) {
          for (let k = cursor; k < lines.length; k++) {
            if (lineEq(ch.anchor, lines[k]!, t)) { found = k; break; }
          }
          if (found !== null) break;
        }
        if (found === null) throw new Fail('no-match', path);
        cursor = found + 1;
      }
      const { o, n } = bodyON(ch.body);
      if (o.length === 0) {
        const at = ch.eof ? lines.length : cursor;
        const ins = n.map((e) => e.text);
        lines = [...lines.slice(0, at), ...ins, ...lines.slice(at)];
        cursor = at + ins.length;
      } else {
        const tiers = strict ? [0] : [0, 1, 2];
        let found: Found | null = null;
        for (const t of tiers) {
          let occ = occurrences(o, lines, t, cursor);
          if (ch.eof) occ = occ.filter((p) => p + o.length === lines.length);
          if (occ.length > 0) { found = { tier: t, pos: occ }; break; }
        }
        if (found === null) throw new Fail('no-match', path);
        const pos = found.pos[0]!;
        const newL = buildNew(o, n, lines, pos, found.tier);
        lines = [...lines.slice(0, pos), ...newL, ...lines.slice(pos + o.length)];
        cursor = pos + newL.length;
      }
    }
    const out = renderFile({ lines, br: f.br, final: f.final });
    if (moveTo !== null) {
      tree.now.set(moveTo, out);
      tree.now.set(path, null);
      moves.push({ old: path, neu: moveTo });
    } else {
      tree.now.set(path, out);
    }
  };
}

/** A V4A section's lines (trailing blank lines stripped), and where the next
 *  section starts. */
function collectV4A(lines: string[], start: number, end: number): { body: string[]; bodyStart: number; next: number } {
  let next = start;
  while (next < end) {
    const l = lines[next]!;
    if (l.startsWith('*** Add File: ') || l.startsWith('*** Delete File: ') || l.startsWith('*** Update File: ')) break;
    next++;
  }
  const body = lines.slice(start, next);
  while (body.length > 0 && blank(body[body.length - 1]!)) body.pop();
  return { body, bodyStart: start, next };
}

function v4aEdits(lines: string[], strict: boolean, moves: Move[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = lines.length - 1;
  while (last >= 0 && blank(lines[last]!)) last--;
  if (last < 0 || lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const edits: Edit[] = [];
  let i = first + 1;
  while (i < last) {
    if (blank(lines[i]!)) { i++; continue; }
    const l = lines[i]!;
    let m: RegExpExecArray | null;
    if ((m = /^\*\*\* Add File: (.*)$/.exec(l)) !== null) {
      const path = m[1]!.trim();
      const sec = collectV4A(lines, i + 1, last);
      edits.push(v4aAdd(path, sec.body, sec.bodyStart));
      i = sec.next;
    } else if ((m = /^\*\*\* Delete File: (.*)$/.exec(l)) !== null) {
      const path = m[1]!.trim();
      const sec = collectV4A(lines, i + 1, last);
      for (let j = 0; j < sec.body.length; j++) {
        if (!blank(sec.body[j]!)) throw new Exit2(`error: parse ${sec.bodyStart + j + 1}`);
      }
      edits.push((tree) => {
        if (!safe(path)) throw new Fail('unsafe', path);
        if (tree.get(path) === null) throw new Fail('missing', path);
        tree.now.set(path, null);
      });
      i = sec.next;
    } else if ((m = /^\*\*\* Update File: (.*)$/.exec(l)) !== null) {
      const path = m[1]!.trim();
      const sec = collectV4A(lines, i + 1, last);
      edits.push(v4aUpdate(path, sec.body, sec.bodyStart, i + 1, strict, moves));
      i = sec.next;
    } else {
      throw new Exit2(`error: parse ${i + 1}`);
    }
  }
  return edits;
}

function parsePatch(kind: string, lines: string[], strict: boolean, moves: Move[]): Edit[] {
  if (kind === 'unified') return unifiedEdits(lines, strict, moves);
  if (kind === 'search-replace') return srEdits(lines, strict);
  return v4aEdits(lines, strict, moves);
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
  const moves: Move[] = [];
  let edits: Edit[];
  try {
    edits = kind === 'json' ? jsonEdits(text, lines) : parsePatch(kind, lines, strict, moves);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const rByNew = new Map<string, string>();
  const rByOld = new Map<string, string>();
  for (const m of moves) {
    if (tree.original(m.old) !== null && tree.get(m.old) === null && tree.original(m.neu) === null && tree.get(m.neu) !== null) {
      rByNew.set(m.neu, m.old);
      rByOld.set(m.old, m.neu);
    }
  }
  const rRows: { key: string; line: string }[] = [];
  const rOlds = new Set<string>();
  const rNews = new Set<string>();
  for (const [neu, old] of rByNew) {
    if (rByOld.get(old) !== neu) continue;
    rRows.push({ key: neu, line: `R ${old} -> ${neu}` });
    rOlds.add(old);
    rNews.add(neu);
  }
  const sorted = [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const rows: { key: string; line: string }[] = [...rRows];
  for (const p of sorted) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    if (rOlds.has(p) && was !== null && now === null) continue;
    if (rNews.has(p) && was === null && now !== null) continue;
    rows.push({ key: p, line: `${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}` });
  }
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  const outLines = rows.map((r) => r.line);
  if (!check) {
    for (const p of sorted) {
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
  return { code: 0, out: [...outLines, `ok: ${outLines.length} ${outLines.length === 1 ? 'file' : 'files'}`] };
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
