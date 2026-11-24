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

// ---------- section 5: lines and matching ----------

interface FileState {
  br: string;
  lines: string[];
  final: boolean;
}

function parseFile(text: string): FileState {
  if (text === '') return { br: '\n', lines: [], final: false };
  const nl = text.indexOf('\n');
  const br = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const parts = text.split(br);
  const final = text.endsWith(br);
  if (final) parts.pop();
  return { br, lines: parts, final };
}

function renderFile(s: FileState): string {
  return s.lines.length === 0 ? '' : s.lines.join(s.br) + (s.final ? s.br : '');
}

function normLine(l: string, tier: number): string {
  if (tier === 0) return l;
  if (tier === 1) return l.replace(/[ \t]+$/, '');
  return l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

function occurrences(lines: string[], o: string[], tier: number, from = 0): number[] {
  const out: number[] = [];
  if (o.length === 0) return out;
  for (let i = from; i + o.length <= lines.length; i++) {
    let ok = true;
    for (let k = 0; k < o.length; k++) {
      if (normLine(lines[i + k]!, tier) !== normLine(o[k]!, tier)) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

function findTier(lines: string[], o: string[], strict: boolean, from = 0, eof = false): { tier: number; pos: number[] } | null {
  const tiers = strict ? [0] : [0, 1, 2];
  for (const t of tiers) {
    const pos = occurrences(lines, o, t, from).filter((p) => !eof || p + o.length === lines.length);
    if (pos.length > 0) return { tier: t, pos };
  }
  return null;
}

function leadingOf(s: string): string {
  const m = /^[ \t]*/.exec(s);
  return m ? m[0] : '';
}

function reindentLine(l: string, p: string, f: string): string {
  if (l === '' || l.trim() === '') return l;
  return l.startsWith(p) ? f + l.slice(p.length) : l;
}

interface OLine { text: string; ctx: boolean; }
interface NLine { text: string; ctx: boolean; oIdx: number; }

interface Hunk {
  a: number;
  o: OLine[];
  n: NLine[];
  bsAfterLastOut: boolean;
  lastPlusBs: boolean;
}

function applyLines(st: FileState, o: OLine[], n: NLine[], pos: number, tier: number): void {
  const f = leadingOf(st.lines[pos] ?? '');
  const p = o.length > 0 ? leadingOf(o[0]!.text) : '';
  const out: string[] = [];
  for (const nl of n) {
    if (nl.ctx) out.push(st.lines[pos + nl.oIdx]!);
    else out.push(tier === 2 ? reindentLine(nl.text, p, f) : nl.text);
  }
  st.lines.splice(pos, o.length, ...out);
}

function applyHunk(st: FileState, h: Hunk, d: number, strict: boolean, path: string): void {
  if (h.o.length === 0) {
    const idx = Math.max(0, Math.min(h.a + d, st.lines.length));
    const atEnd = idx === st.lines.length;
    st.lines.splice(idx, 0, ...h.n.map((nl) => nl.text));
    if (atEnd) st.final = !h.bsAfterLastOut;
    return;
  }
  const found = findTier(st.lines, h.o.map((x) => x.text), strict);
  if (found === null) throw new Fail('no-match', path);
  const target = h.a - 1 + d;
  let pos = found.pos[0]!;
  let best = Math.abs(pos - target);
  for (const p of found.pos) {
    const dist = Math.abs(p - target);
    if (dist < best) { best = dist; pos = p; }
  }
  const reachesEnd = pos + h.o.length === st.lines.length;
  applyLines(st, h.o, h.n, pos, found.tier);
  if (reachesEnd) st.final = !h.bsAfterLastOut;
}

// ---------- section 6: unified diffs ----------

interface Section {
  pairOld: string | null;
  pairNew: string | null;
  hasPair: boolean;
  renameOld: string | undefined;
  renameNew: string | undefined;
  diffOld: string | undefined;
  diffNew: string | undefined;
  isCreate: boolean;
  isDelete: boolean;
  hadHunk: boolean;
  hunks: Hunk[];
}

function parsePatchPath(l: string): string | null {
  let p = l.slice(4);
  const tab = p.indexOf('\t');
  if (tab >= 0) p = p.slice(0, tab);
  p = p.trim();
  if (p === '/dev/null') return null;
  if (p.startsWith('a/') || p.startsWith('b/')) p = p.slice(2);
  return p;
}

function parseDiffGit(l: string, lineNo: number): { old: string; nw: string } {
  const rest = l.slice('diff --git '.length);
  if (!rest.startsWith('a/')) throw new Exit2(`error: parse ${lineNo}`);
  const idx = rest.indexOf(' b/', 2);
  if (idx < 0) throw new Exit2(`error: parse ${lineNo}`);
  const x = rest.slice(2, idx);
  const y = rest.slice(idx + 3);
  if (x === '' || y === '') throw new Exit2(`error: parse ${lineNo}`);
  return { old: x, nw: y };
}

function buildHunk(a: number, body: string[]): Hunk {
  let end = body.length;
  while (end > 0 && body[end - 1] === '') end--;
  const b = body.slice(0, end);
  const o: OLine[] = [];
  const n: NLine[] = [];
  let lastOut = -1;
  let lastPlus = -1;
  for (let k = 0; k < b.length; k++) {
    const l = b[k]!;
    if (l === '' || l.startsWith(' ') || l.startsWith('+')) lastOut = k;
    if (l.startsWith('+')) lastPlus = k;
  }
  const bsAfterLastOut = lastOut >= 0 && b[lastOut + 1] !== undefined && b[lastOut + 1]!.startsWith('\\');
  const lastPlusBs = lastPlus >= 0 && b[lastPlus + 1] !== undefined && b[lastPlus + 1]!.startsWith('\\');
  for (const l of b) {
    if (l === '' || l.startsWith(' ')) {
      const text = l === '' ? '' : l.slice(1);
      const oIdx = o.length;
      o.push({ text, ctx: true });
      n.push({ text, ctx: true, oIdx });
    } else if (l.startsWith('-')) {
      o.push({ text: l.slice(1), ctx: false });
    } else if (l.startsWith('+')) {
      n.push({ text: l.slice(1), ctx: false, oIdx: -1 });
    }
  }
  return { a, o, n, bsAfterLastOut, lastPlusBs };
}

function lastPlusBsOf(hunks: Hunk[]): boolean {
  for (let k = hunks.length - 1; k >= 0; k--) {
    const h = hunks[k]!;
    if (h.n.some((x) => !x.ctx)) return h.lastPlusBs;
  }
  return false;
}

function unifiedEdits(lines: string[], strict: boolean, moves: { old: string; nw: string }[]): Edit[] {
  const sections: Section[] = [];
  const n = lines.length;
  const isDiffGit = (l: string): boolean => l.startsWith('diff --git ');
  const hunkHead = (l: string): number | null => {
    const m = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(l);
    return m ? parseInt(m[1]!, 10) : null;
  };
  const newSection = (): Section => ({
    pairOld: null, pairNew: null, hasPair: false,
    renameOld: undefined, renameNew: undefined,
    diffOld: undefined, diffNew: undefined,
    isCreate: false, isDelete: false, hadHunk: false, hunks: [],
  });
  let cur: Section | null = null;
  let body: string[] | null = null;
  let bodyA = 0;
  const finishBody = (): void => {
    if (cur !== null && body !== null) {
      cur.hunks.push(buildHunk(bodyA, body));
      cur.hadHunk = true;
    }
    body = null;
  };
  const finishSection = (): void => {
    finishBody();
    if (cur !== null) sections.push(cur);
    cur = null;
  };
  let i = 0;
  while (i < n) {
    const l = lines[i]!;
    if (body !== null) {
      if (isDiffGit(l)) { finishSection(); continue; }
      if (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) { finishSection(); continue; }
      if (l === '' || l.startsWith(' ') || l.startsWith('-') || l.startsWith('+') || l.startsWith('\\')) {
        body.push(l);
        i++;
        continue;
      }
      finishBody();
      continue;
    }
    if (isDiffGit(l)) {
      const dg = parseDiffGit(l, i + 1);
      finishSection();
      cur = newSection();
      cur.diffOld = dg.old;
      cur.diffNew = dg.nw;
      i++;
      continue;
    }
    if (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      const oldP = parsePatchPath(l);
      const newP = parsePatchPath(lines[i + 1]!);
      if (cur !== null && !cur.hadHunk && !cur.hasPair) {
        cur.pairOld = oldP;
        cur.pairNew = newP;
        cur.hasPair = true;
      } else {
        finishSection();
        cur = newSection();
        cur.pairOld = oldP;
        cur.pairNew = newP;
        cur.hasPair = true;
      }
      i += 2;
      continue;
    }
    if (cur !== null) {
      if (!cur.hadHunk) {
        if (l.startsWith('--- ')) throw new Exit2(`error: parse ${i + 2}`);
        if (l.startsWith('rename from ')) { cur.renameOld = l.slice('rename from '.length).trim(); i++; continue; }
        if (l.startsWith('rename to ')) { cur.renameNew = l.slice('rename to '.length).trim(); i++; continue; }
        if (l === 'new file mode' || l.startsWith('new file mode ')) { cur.isCreate = true; i++; continue; }
        if (l === 'deleted file mode' || l.startsWith('deleted file mode ')) { cur.isDelete = true; i++; continue; }
      }
      if (l.startsWith('@@')) {
        const a = hunkHead(l);
        if (a === null) throw new Exit2(`error: parse ${i + 1}`);
        body = [];
        bodyA = a;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (l.startsWith('@@')) throw new Exit2(`error: parse ${i + 1}`);
    i++;
  }
  finishSection();
  return sections.map((s) => sectionEdit(s, strict, moves));
}

function sectionEdit(s: Section, strict: boolean, moves: { old: string; nw: string }[]): Edit {
  const oldPath = s.hasPair ? s.pairOld : (s.renameOld ?? s.diffOld ?? null);
  const newPath = s.hasPair ? s.pairNew : (s.renameNew ?? s.diffNew ?? null);
  let kind: 'create' | 'delete' | 'move' | 'change' | 'noop';
  if (oldPath === null && newPath === null) kind = 'noop';
  else if (newPath !== null && (s.isCreate || oldPath === null)) kind = 'create';
  else if (s.isDelete || newPath === null) kind = 'delete';
  else if (oldPath !== newPath) kind = 'move';
  else kind = 'change';
  if (kind === 'noop') return () => { /* names no file */ };
  if (kind === 'create') {
    const p = newPath!;
    const plusLines: string[] = [];
    for (const h of s.hunks) for (const nl of h.n) if (!nl.ctx) plusLines.push(nl.text);
    const final = !lastPlusBsOf(s.hunks);
    const text = plusLines.length === 0 ? '' : plusLines.join('\n') + (final ? '\n' : '');
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (kind === 'delete') {
    const p = oldPath!;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
    };
  }
  if (kind === 'move') {
    const oldP = oldPath!;
    const newP = newPath!;
    return (tree) => {
      if (!safe(oldP)) throw new Fail('unsafe', oldP);
      if (!safe(newP)) throw new Fail('unsafe', newP);
      const before = tree.get(oldP);
      if (before === null) throw new Fail('missing', oldP);
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      const st = parseFile(before);
      let d = 0;
      for (const h of s.hunks) {
        applyHunk(st, h, d, strict, oldP);
        d += h.n.length - h.o.length;
      }
      tree.now.set(newP, renderFile(st));
      tree.now.set(oldP, null);
      moves.push({ old: oldP, nw: newP });
    };
  }
  const p = oldPath!;
  return (tree) => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const before = tree.get(p);
    if (before === null) throw new Fail('missing', p);
    const st = parseFile(before);
    let d = 0;
    for (const h of s.hunks) {
      applyHunk(st, h, d, strict, p);
      d += h.n.length - h.o.length;
    }
    tree.now.set(p, renderFile(st));
  };
}

type Edit = (tree: Tree) => void;

// ---------- section 7: SEARCH/REPLACE blocks ----------

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
    const st = parseFile(before);
    const found = findTier(st.lines, oldLines, strict);
    if (found === null) throw new Fail('no-match', path);
    if (found.pos.length > 1) throw new Fail('ambiguous', path);
    const pos = found.pos[0]!;
    const f = leadingOf(st.lines[pos] ?? '');
    const p = leadingOf(oldLines[0]!);
    const out: string[] = newLines.map((l) => (found.tier === 2 ? reindentLine(l, p, f) : l));
    st.lines.splice(pos, oldLines.length, ...out);
    tree.now.set(path, renderFile(st));
  };
}

function srEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  const n = lines.length;
  let prevReplaceEnd = -1;
  let prevPath: string | undefined;
  let i = 0;
  while (i < n) {
    let s = -1;
    for (let k = i; k < n; k++) {
      if (lines[k]!.trimEnd() === '<<<<<<< SEARCH') { s = k; break; }
    }
    if (s < 0) break;
    let path: string | undefined;
    for (let k = s - 1; k > prevReplaceEnd; k--) {
      const l = lines[k]!;
      if (blank(l)) continue;
      if (l.trim().startsWith('```')) continue;
      path = l.trim();
      break;
    }
    if (path === undefined) {
      if (prevPath === undefined) throw new Exit2(`error: parse ${s + 1}`);
      path = prevPath;
    }
    let eq = -1;
    for (let k = s + 1; k < n; k++) {
      if (lines[k]!.trimEnd() === '=======') { eq = k; break; }
    }
    if (eq < 0) throw new Exit2(`error: parse ${s + 1}`);
    let rep = -1;
    for (let k = eq + 1; k < n; k++) {
      if (lines[k]!.trimEnd() === '>>>>>>> REPLACE') { rep = k; break; }
    }
    if (rep < 0) throw new Exit2(`error: parse ${s + 1}`);
    edits.push(srEdit(path, lines.slice(s + 1, eq), lines.slice(eq + 1, rep), strict));
    prevPath = path;
    prevReplaceEnd = rep;
    i = rep + 1;
  }
  return edits;
}

// ---------- section 8: V4A patches ----------

interface VChunk {
  anchor: string | null;
  o: OLine[];
  n: NLine[];
  eof: boolean;
}

function v4aEdits(lines: string[], strict: boolean, moves: { old: string; nw: string }[]): Edit[] {
  const n = lines.length;
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = -1;
  for (let k = n - 1; k >= 0; k--) {
    if (!blank(lines[k]!)) { last = k; break; }
  }
  if (lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${n + 1}`);
  const isSectionStart = (l: string): boolean =>
    l.startsWith('*** Add File: ') || l.startsWith('*** Delete File: ') || l.startsWith('*** Update File: ');
  const edits: Edit[] = [];
  let i = first + 1;
  while (i < last) {
    while (i < last && blank(lines[i]!)) i++;
    if (i >= last) break;
    const l = lines[i]!;
    let kind: 'add' | 'del' | 'upd';
    let path: string;
    if (l.startsWith('*** Add File: ')) { kind = 'add'; path = l.slice('*** Add File: '.length).trim(); }
    else if (l.startsWith('*** Delete File: ')) { kind = 'del'; path = l.slice('*** Delete File: '.length).trim(); }
    else if (l.startsWith('*** Update File: ')) { kind = 'upd'; path = l.slice('*** Update File: '.length).trim(); }
    else throw new Exit2(`error: parse ${i + 1}`);
    const start = i + 1;
    let j = start;
    while (j < last && !isSectionStart(lines[j]!)) j++;
    const secLines = lines.slice(start, j);
    while (secLines.length > 0 && blank(secLines[secLines.length - 1]!)) secLines.pop();
    edits.push(v4aSectionEdit(kind, path, secLines, start, i + 1, strict, moves));
    i = j;
  }
  return edits;
}

function v4aSectionEdit(
  kind: 'add' | 'del' | 'upd', path: string, secLines: string[],
  secStart: number, updateLineNo: number, strict: boolean,
  moves: { old: string; nw: string }[],
): Edit {
  if (kind === 'add') {
    for (let k = 0; k < secLines.length; k++) {
      const l = secLines[k]!;
      if (l !== '' && !l.startsWith('+')) throw new Exit2(`error: parse ${secStart + k + 1}`);
    }
    const content = secLines.map((l) => (l === '' ? '' : l.slice(1)));
    return (tree) => {
      if (!safe(path)) throw new Fail('unsafe', path);
      if (tree.get(path) !== null) throw new Fail('exists', path);
      tree.now.set(path, content.length === 0 ? '' : content.join('\n') + '\n');
    };
  }
  if (kind === 'del') {
    if (secLines.length > 0) throw new Exit2(`error: parse ${secStart + 1}`);
    return (tree) => {
      if (!safe(path)) throw new Fail('unsafe', path);
      if (tree.get(path) === null) throw new Fail('missing', path);
      tree.now.set(path, null);
    };
  }
  let moveTo: string | undefined;
  let idx = 0;
  if (secLines.length > 0 && secLines[0]!.startsWith('*** Move to: ')) {
    moveTo = secLines[0]!.slice('*** Move to: '.length).trim();
    idx = 1;
  }
  const chunks: VChunk[] = [];
  let cur: VChunk | null = null;
  const endChunk = (): void => { if (cur) { chunks.push(cur); cur = null; } };
  for (; idx < secLines.length; idx++) {
    const l = secLines[idx]!;
    const lineNo = secStart + idx + 1;
    if (l.startsWith('@@')) {
      endChunk();
      const anchor = l.slice(2).trim();
      cur = { anchor: anchor === '' ? null : anchor, o: [], n: [], eof: false };
      continue;
    }
    if (l === '*** End of File') {
      if (!cur) throw new Exit2(`error: parse ${lineNo}`);
      cur.eof = true;
      endChunk();
      continue;
    }
    if (l === '' || l.startsWith(' ') || l.startsWith('-') || l.startsWith('+')) {
      if (!cur) {
        if (chunks.length === 0) cur = { anchor: null, o: [], n: [], eof: false };
        else throw new Exit2(`error: parse ${lineNo}`);
      }
      if (l === '' || l.startsWith(' ')) {
        const text = l === '' ? '' : l.slice(1);
        const oIdx = cur.o.length;
        cur.o.push({ text, ctx: true });
        cur.n.push({ text, ctx: true, oIdx });
      } else if (l.startsWith('-')) {
        cur.o.push({ text: l.slice(1), ctx: false });
      } else {
        cur.n.push({ text: l.slice(1), ctx: false, oIdx: -1 });
      }
      continue;
    }
    throw new Exit2(`error: parse ${lineNo}`);
  }
  endChunk();
  if (chunks.length === 0 && moveTo === undefined) throw new Exit2(`error: parse ${updateLineNo}`);
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    if (moveTo !== undefined) {
      if (!safe(moveTo)) throw new Fail('unsafe', moveTo);
      if (tree.get(moveTo) !== null) throw new Fail('exists', moveTo);
    }
    const st = parseFile(before);
    let cursor = 0;
    for (const ch of chunks) {
      if (ch.anchor !== null) {
        let foundAt: number | null = null;
        const tiers = strict ? [0] : [0, 1, 2];
        for (const t of tiers) {
          for (let k = cursor; k < st.lines.length; k++) {
            if (normLine(st.lines[k]!, t) === normLine(ch.anchor, t)) { foundAt = k; break; }
          }
          if (foundAt !== null) break;
        }
        if (foundAt === null) throw new Fail('no-match', path);
        cursor = foundAt + 1;
      }
      if (ch.o.length === 0) {
        const at = ch.eof ? st.lines.length : cursor;
        const ins = ch.n.map((nl) => nl.text);
        st.lines.splice(at, 0, ...ins);
        cursor = at + ins.length;
      } else {
        const found = findTier(st.lines, ch.o.map((x) => x.text), strict, cursor, ch.eof);
        if (found === null) throw new Fail('no-match', path);
        const pos = found.pos[0]!;
        const f = leadingOf(st.lines[pos] ?? '');
        const p = leadingOf(ch.o[0]!.text);
        const out: string[] = [];
        for (const nl of ch.n) {
          if (nl.ctx) out.push(st.lines[pos + nl.oIdx]!);
          else out.push(found.tier === 2 ? reindentLine(nl.text, p, f) : nl.text);
        }
        st.lines.splice(pos, ch.o.length, ...out);
        cursor = pos + out.length;
      }
    }
    const result = renderFile(st);
    if (moveTo !== undefined) {
      tree.now.set(moveTo, result);
      tree.now.set(path, null);
      moves.push({ old: path, nw: moveTo });
    } else {
      tree.now.set(path, result);
    }
  };
}

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
  const moves: { old: string; nw: string }[] = [];
  let edits: Edit[];
  try {
    edits = kind === 'json' ? jsonEdits(text, lines)
      : kind === 'unified' ? unifiedEdits(lines, strict, moves)
      : kind === 'search-replace' ? srEdits(lines, strict)
      : v4aEdits(lines, strict, moves);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    const movesBefore = moves.length;
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      moves.length = movesBefore;
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const nowVal = (p: string): string | null => (tree.now.has(p) ? tree.now.get(p)! : tree.original(p));
  const entries: { key: string; line: string }[] = [];
  const covered = new Set<string>();
  for (const m of moves) {
    if (tree.original(m.old) !== null && nowVal(m.old) === null && tree.original(m.nw) === null && nowVal(m.nw) !== null) {
      entries.push({ key: m.nw, line: `R ${m.old} -> ${m.nw}` });
      covered.add(m.old);
      covered.add(m.nw);
    }
  }
  for (const p of [...tree.now.keys()]) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    if (covered.has(p)) continue;
    entries.push({ key: p, line: `${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}` });
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  const rows = entries.map((e) => e.line);
  if (!check) {
    for (const p of [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
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
