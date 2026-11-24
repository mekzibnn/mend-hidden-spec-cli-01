// edge-v3.mjs — SPEC corner-case suite for mend v3 (written test-first, before main.ts).
// Run: node edge-v3.mjs   (exit 0 when every case passes)
// Each case is one run of `node main.ts` in a fresh directory (via runner.ts runCheck):
// argv, stdin, starting files -> expected exit code, stdout, and full final file tree.
import { runCheck } from './runner.ts';

const cases = [];
function C(o) { cases.push(o); }

const F4 = 'alpha\nbeta\ngamma\ndelta\n';
const HDR = 'diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n';
// Single-file unified change, stdin patch, default header.
function U(id, body, files, exit, stdout, exp, argv = []) {
  C({ id, argv, stdin: HDR + body, files, exit, stdout, exp });
}

// ---------- unified diffs ----------
U('U01', '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
U('U03', '@@ -2,1 +2,1 @@\n-a\n+A\n', { 'f.txt': 'x\na\nx\na\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'x\nA\nx\na\n' });
U('U04', '@@ -2,1 +2,1 @@\n-a\n+A\n', { 'f.txt': 'a\nx\na\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'A\nx\na\n' });
U('U05', '@@ -3,1 +3,1 @@\n-a\n+A\n', { 'f.txt': 'a\nx\na\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'a\nx\nA\n' });
U('U06', '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', { 'f.txt': 'alpha \nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'ALPHA\nbeta\n' });
U('U08', '@@ -1,1 +1,1 @@\n-    alpha\n+    ALPHA\n+    extra\n', { 'f.txt': '  alpha\n  beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n  extra\n  beta\n' });
U('U09', '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n+extra\n', { 'f.txt': '  alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n  extra\nbeta\n' });
U('U10', '@@ -1,1 +1,1 @@\n-    alpha\n+    ALPHA\n+noindent\n', { 'f.txt': '  alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\nnoindent\nbeta\n' });
U('U11', '@@ -1,1 +1,1 @@\n-    alpha\n+    ALPHA\n+\n+   \n+    tail\n', { 'f.txt': '  alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n\n   \n  tail\nbeta\n' });
U('U12', '@@ -1,2 +1,2 @@\n   alpha\n-    beta\n+    BETA\n', { 'f.txt': '    alpha\n    beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '    alpha\n      BETA\n' });
U('U13', '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', { 'f.txt': 'alpha \nbeta\n' }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'alpha \nbeta\n' }, ['--strict']);
U('U14', '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', { 'f.txt': 'alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'ALPHA\nbeta\n' }, ['--strict']);
U('U15', '@@ -0,0 +1,2 @@\n+new1\n+new2\n', { 'f.txt': 'alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'new1\nnew2\nalpha\nbeta\n' });
U('U16', '@@ -2,0 +3,1 @@\n+mid\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\nmid\ngamma\ndelta\n' });
U('U17', '@@ -2,0 +3,1 @@\n+tail\n', { 'f.txt': 'alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\ntail\n' });
U('U19', '@@ -1,3 +1,0 @@\n-a\n-b\n-c\n@@ -1,0 +1,1 @@\n+top\n', { 'f.txt': 'a\nb\nc\nd\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'top\nd\n' });
U('U20', '@@ -2,1 +2,1 @@\n-beta\n\\ No newline at end of file\n+beta2\n', { 'f.txt': 'alpha\nbeta' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\n' });
U('U21', '@@ -2,1 +2,1 @@\n-beta\n+beta2\n\\ No newline at end of file\n', { 'f.txt': 'alpha\nbeta' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2' });
U('U22', '@@ -1,1 +2,0 @@\n alpha\n-beta\n\\ No newline at end of file\n', { 'f.txt': 'alpha\nbeta' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\n' });
U('U24', '@@ -2,1 +2,1 @@\n-beta\n+BETA\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nBETA\ngamma\ndelta\n' });
U('U25', '@@ -2,1 +2,1 @@\n-beta\n+BETA\n', { 'f.txt': 'alpha\nbeta\ngamma' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nBETA\ngamma' });
U('U26', '@@ -2,1 +2,1 @@\n-beta\n+BETA\n', { 'f.txt': 'alpha\r\nbeta\r\ngamma\r\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\r\nBETA\r\ngamma\r\n' });
U('U27', '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', { 'f.txt': 'alpha\r\nbeta' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\r\nbeta2\r\n' });

// ---------- unified: creates, deletes, moves ----------
C({ id: 'U28', argv: [], stdin: 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+line1\n+line2\n', files: {}, exit: 0, stdout: 'A new.txt\nok: 1 file\n', exp: { 'new.txt': 'line1\nline2\n' } });
C({ id: 'U30', argv: [], stdin: 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n+line1\n', files: { 'new.txt': 'old\n' }, exit: 1, stdout: 'error: exists new.txt\nfailed: 1 of 1 edits\n', exp: { 'new.txt': 'old\n' } });
C({ id: 'U31', argv: [], stdin: 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+line1\n+line2\n\\ No newline at end of file\n', files: {}, exit: 0, stdout: 'A new.txt\nok: 1 file\n', exp: { 'new.txt': 'line1\nline2' } });
C({ id: 'U33', argv: [], stdin: 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n ctx\n+line1\n', files: {}, exit: 0, stdout: 'A new.txt\nok: 1 file\n', exp: { 'new.txt': 'line1\n' } });
C({ id: 'U34', argv: [], stdin: 'diff --git a/f.txt b/f.txt\ndeleted file mode 100644\n--- a/f.txt\n+++ /dev/null\n@@ -1,2 +1,0 @@\n-alpha\n-beta\n', files: { 'f.txt': 'x\ny\n' }, exit: 0, stdout: 'D f.txt\nok: 1 file\n', exp: {} });
C({ id: 'U36', argv: [], stdin: 'diff --git a/f.txt b/f.txt\ndeleted file mode 100644\n--- a/f.txt\n+++ /dev/null\n@@ -1,1 +1,0 @@\n-x\n', files: {}, exit: 1, stdout: 'error: missing f.txt\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U38', argv: [], stdin: 'diff --git a/old.txt b/new.txt\nsimilarity index 90%\nrename from old.txt\nrename to new.txt\n', files: { 'old.txt': 'alpha\n' }, exit: 0, stdout: 'R old.txt -> new.txt\nok: 1 file\n', exp: { 'new.txt': 'alpha\n' } });
C({ id: 'U39', argv: [], stdin: 'diff --git a/old.txt b/new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1,1 +1,1 @@\n-alpha\n+alpha2\n', files: { 'old.txt': 'alpha\n' }, exit: 0, stdout: 'R old.txt -> new.txt\nok: 1 file\n', exp: { 'new.txt': 'alpha2\n' } });
C({ id: 'U40', argv: [], stdin: 'diff --git a/old.txt b/new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1,1 +1,1 @@\n-alpha\n+alpha2\n', files: {}, exit: 1, stdout: 'error: missing old.txt\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U41', argv: [], stdin: 'diff --git a/old.txt b/new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1,1 +1,1 @@\n-alpha\n+alpha2\n', files: { 'old.txt': 'alpha\n', 'new.txt': 'taken\n' }, exit: 1, stdout: 'error: exists new.txt\nfailed: 1 of 1 edits\n', exp: { 'old.txt': 'alpha\n', 'new.txt': 'taken\n' } });
C({ id: 'U43', argv: [], stdin: 'diff --git a/z.txt b/a.txt\n--- a/z.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-z\n+z2\ndiff --git a/m.txt b/b.txt\n--- a/m.txt\n+++ b/b.txt\n@@ -1,1 +1,1 @@\n-m\n+m2\n', files: { 'z.txt': 'z\n', 'm.txt': 'm\n' }, exit: 0, stdout: 'R z.txt -> a.txt\nR m.txt -> b.txt\nok: 2 files\n', exp: { 'a.txt': 'z2\n', 'b.txt': 'm2\n' } });
C({ id: 'U44', argv: [], stdin: HDR + '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', files: {}, exit: 1, stdout: 'error: missing f.txt\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U45', argv: [], stdin: 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-x\n+x2\ndiff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1,1 +1,1 @@\n-y\n+y2\n', files: { 'a.txt': 'x\n', 'b.txt': 'y\n' }, exit: 0, stdout: 'M a.txt\nM b.txt\nok: 2 files\n', exp: { 'a.txt': 'x2\n', 'b.txt': 'y2\n' } });
C({ id: 'U46', argv: [], stdin: HDR + '@@ -2,1 +2,0 @@\n-beta\n@@ -4,1 +4,1 @@\n-delta\n+DELTA\n', files: { 'f.txt': F4 }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'f.txt': 'alpha\ngamma\nDELTA\n' } });
C({ id: 'U47', argv: [], stdin: HDR + '@@ -1,1 +1,1 @@\n--- foo\n+-- bar\n', files: { 'f.txt': '-- foo\nbar\n' }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'f.txt': '-- bar\nbar\n' } });
C({ id: 'U48', argv: [], stdin: HDR + '@@ -1,1 +1,1 @@\n-alpha\n+alpha2\n--- g.txt\n+++ b/g.txt\n@@ -1,1 +1,1 @@\n-x\n+x2\n', files: { 'f.txt': 'alpha\n', 'g.txt': 'x\n' }, exit: 0, stdout: 'M f.txt\nM g.txt\nok: 2 files\n', exp: { 'f.txt': 'alpha2\n', 'g.txt': 'x2\n' } });
C({ id: 'U49', argv: [], stdin: 'diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n--- a/g.txt\n+++ b/g.txt\n@@ -1,1 +1,1 @@\n-x\n+x2\n', files: { 'f.txt': 'alpha\n', 'g.txt': 'x\n' }, exit: 0, stdout: 'M g.txt\nok: 1 file\n', exp: { 'f.txt': 'alpha\n', 'g.txt': 'x2\n' } });
C({ id: 'U50', argv: [], stdin: 'diff --git a/f.txt b/f.txt\n--- a/f.txt\nindex 1234\n', files: { 'f.txt': 'alpha\n' }, exit: 2, stdout: 'error: parse 3\n', exp: { 'f.txt': 'alpha\n' } });
C({ id: 'U51', argv: [], stdin: 'diff --git a/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n', files: { 'f.txt': 'x\n' }, exit: 2, stdout: 'error: parse 1\n', exp: { 'f.txt': 'x\n' } });
C({ id: 'U52', argv: [], stdin: HDR + '@@ bad\n', files: { 'f.txt': 'x\n' }, exit: 2, stdout: 'error: parse 4\n', exp: { 'f.txt': 'x\n' } });
C({ id: 'U53', argv: [], stdin: '@@ -1,1 +1,1 @@\n-x\n+y\n', files: { 'f.txt': 'x\n' }, exit: 2, stdout: 'error: format\n', exp: { 'f.txt': 'x\n' } });
U('U55', '@@ -1,1 +1,1 @@\n-a\n+A\n\n\n', { 'f.txt': 'a\nb\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'A\nb\n' });
U('U56', '@@ -1,4 +1,4 @@\n a\n\n-b\n+B\n c\n', { 'f.txt': 'a\n\nb\nc\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'a\n\nB\nc\n' });
C({ id: 'U57', argv: [], stdin: 'Some prose here.\n' + HDR + '@@ -1,1 +1,1 @@\n-x\n+y\nMore prose.\ndiff --git a/g.txt b/g.txt\n--- a/g.txt\n+++ b/g.txt\n@@ -1,1 +1,1 @@\n-p\n+q\n', files: { 'f.txt': 'x\n', 'g.txt': 'p\n' }, exit: 0, stdout: 'M f.txt\nM g.txt\nok: 2 files\n', exp: { 'f.txt': 'y\n', 'g.txt': 'q\n' } });
U('U59', '@@ -1,1 +1,1 @@\n-zzz\n+yyy\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
C({ id: 'U61', argv: [], stdin: 'diff --git a/../evil.txt b/../evil.txt\n--- ../evil.txt\n+++ ../evil.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n', files: {}, exit: 1, stdout: 'error: unsafe ../evil.txt\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U62', argv: [], stdin: 'diff --git a/x b/x\n--- /etc/x\n+++ /etc/x\n@@ -1,1 +1,1 @@\n-x\n+y\n', files: {}, exit: 1, stdout: 'error: unsafe /etc/x\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U63', argv: [], stdin: 'diff --git a/x b/x\n--- a\\b\n+++ a\\b\n@@ -1,1 +1,1 @@\n-x\n+y\n', files: {}, exit: 1, stdout: 'error: unsafe a\\b\nfailed: 1 of 1 edits\n', exp: {} });
C({ id: 'U66', argv: [], stdin: 'diff --git a/f.txt b/f.txt\n--- a/f.txt\t2024-01-01 10:00:00\n+++ b/f.txt\t2024-01-01\n@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', files: { 'f.txt': 'alpha\n' }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'f.txt': 'ALPHA\n' } });
C({ id: 'U68', argv: [], stdin: 'diff --git a/m.txt b/m.txt\n--- a/m.txt\n+++ b/m.txt\n@@ -1,1 +1,1 @@\n-x\n+y\ndiff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-zzz\n+yyy\n', files: { 'f.txt': F4 }, exit: 1, stdout: 'error: missing m.txt\nerror: no-match f.txt\nfailed: 2 of 2 edits\n', exp: { 'f.txt': F4 } });
C({ id: 'U69', argv: [], stdin: 'diff --git a/m.txt b/m.txt\n--- a/m.txt\n+++ b/m.txt\n@@ -1,1 +1,1 @@\n-x\n+y\ndiff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', files: { 'f.txt': F4 }, exit: 1, stdout: 'error: missing m.txt\nfailed: 1 of 2 edits\n', exp: { 'f.txt': F4 } });
U('U70', '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': F4 }, ['--check']);
U('U71', '@@ -2,1 +2,1 @@\n-beta\n+beta\n', { 'f.txt': F4 }, 0, 'ok: 0 files\n', { 'f.txt': F4 });
C({ id: 'U72', argv: [], stdin: 'diff --git a/a/b/c.txt b/a/b/c.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a/b/c.txt\n@@ -0,0 +1,1 @@\n+deep\n', files: {}, exit: 0, stdout: 'A a/b/c.txt\nok: 1 file\n', exp: { 'a/b/c.txt': 'deep\n' } });
U('U74', '@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n', { 'f.txt': '  alpha  \nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\nbeta\n' });
U('U76', '@@ -1,3 +1,0 @@\n-a\n-b\n-c\n@@ -5,1 +5,1 @@\n-e\n+E\n', { 'f.txt': 'a\nb\nc\nd\ne\nf\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'd\nE\nf\n' });
U('U77', '@@ -0,1 +0,1 @@\n-a\n+A\n', { 'f.txt': 'a\nb\na\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'A\nb\na\n' });
U('U79', '@@ -0,0 +1,1 @@\n+first\n', { 'f.txt': '' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'first\n' });
U('U80', '@@ -1,1 +1,1 @@\n-x\n+y\n', { 'f.txt': '' }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': '' });

// ---------- SEARCH/REPLACE ----------
function S(id, patch, files, exit, stdout, exp, argv = []) {
  C({ id, argv, stdin: patch, files, exit, stdout, exp });
}
S('S01', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
S('S02', 'f.txt\n<<<<<<< SEARCH\nalpha\n=======\nALPHA\n>>>>>>> REPLACE\n', { 'f.txt': 'alpha \nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'ALPHA\nbeta\n' });
S('S03', 'f.txt\n<<<<<<< SEARCH\n    alpha\n=======\n    ALPHA\n    extra\n>>>>>>> REPLACE\n', { 'f.txt': '  alpha\n  beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n  extra\n  beta\n' });
S('S04', 'f.txt\n<<<<<<< SEARCH\nalpha\n=======\nALPHA\nextra\n>>>>>>> REPLACE\n', { 'f.txt': '  alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n  extra\nbeta\n' });
S('S05', 'f.txt\n<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n', { 'f.txt': 'a\nx\na\n' }, 1, 'error: ambiguous f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'a\nx\na\n' });
S('S06', 'f.txt\n<<<<<<< SEARCH\nzzz\n=======\nyyy\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
S('S07', 'f.txt\n<<<<<<< SEARCH\nalpha\n=======\nALPHA\n>>>>>>> REPLACE\n', { 'f.txt': 'alpha \nbeta\n' }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'alpha \nbeta\n' }, ['--strict']);
S('S08', 'new.txt\n<<<<<<< SEARCH\n=======\nline1\nline2\n>>>>>>> REPLACE\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'line1\nline2\n' });
S('S09', 'new.txt\n<<<<<<< SEARCH\n=======\nline1\n>>>>>>> REPLACE\n', { 'new.txt': 'old\n' }, 1, 'error: exists new.txt\nfailed: 1 of 1 edits\n', { 'new.txt': 'old\n' });
S('S10', 'new.txt\n<<<<<<< SEARCH\n=======\n>>>>>>> REPLACE\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': '' });
S('S11', '  f.txt  \n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
S('S12', '```\nsub/f.txt\n```\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'sub/f.txt': F4 }, 0, 'M sub/f.txt\nok: 1 file\n', { 'sub/f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
S('S14', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n\n<<<<<<< SEARCH\ngamma\n=======\ngamma2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma2\ndelta\n' });
S('S15', '<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 2, 'error: parse 1\n', { 'f.txt': F4 });
S('S16', 'f.txt\n<<<<<<< SEARCH\nbeta\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 2, 'error: parse 2\n', { 'f.txt': F4 });
S('S17', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n', { 'f.txt': F4 }, 2, 'error: parse 2\n', { 'f.txt': F4 });
S('S18', 'f.txt\n<<<<<<< SEARCH   \nbeta\n=======  \nbeta2\n>>>>>>> REPLACE\t\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
S('S19', 'f.txt\n  <<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 2, 'error: parse 1\n', { 'f.txt': F4 }, ['--format=search-replace']);
S('S20', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\nf.txt\n<<<<<<< SEARCH\ngamma\n=======\ngamma2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma2\ndelta\n' });
S('S21', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\ng.txt\n<<<<<<< SEARCH\ny\n=======\ny2\n>>>>>>> REPLACE\n', { 'f.txt': F4, 'g.txt': 'y\n' }, 0, 'M f.txt\nM g.txt\nok: 2 files\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n', 'g.txt': 'y2\n' });
S('S23', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\nbeta3\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
S('S24', '../evil.txt\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n', {}, 1, 'error: unsafe ../evil.txt\nfailed: 1 of 1 edits\n', {});
S('S25', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', {}, 1, 'error: missing f.txt\nfailed: 1 of 1 edits\n', {});
S('S26', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nBETA\n>>>>>>> REPLACE\n', { 'f.txt': 'alpha\r\nbeta\r\ngamma\r\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\r\nBETA\r\ngamma\r\n' });
S('S27', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': F4 }, ['--check']);
S('S28', 'f.txt\n<<<<<<< SEARCH\na\na\n=======\nA\n>>>>>>> REPLACE\n', { 'f.txt': 'a\na\na\n' }, 1, 'error: ambiguous f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'a\na\na\n' });
S('S30', 'f.txt\n<<<<<<< SEARCH\nbeta \n=======\nBETA\n>>>>>>> REPLACE\n', { 'f.txt': 'alpha\nbeta\ngamma\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nBETA\ngamma\n' });
S('S31', 'f.txt\n<<<<<<< SEARCH\n  alpha\n=======\nALPHA\n>>>>>>> REPLACE\n', { 'f.txt': '  alpha\n  beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'ALPHA\n  beta\n' });
S('S32', './f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 1, 'error: unsafe ./f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
S('S33', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\ngamma\ndelta\n' });
S('S34', 'f.txt\n<<<<<<< SEARCH\nalpha\nbeta\ngamma\ndelta\n=======\nX\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'X\n' });
S('S35', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nbeta2\n>>>>>>> REPLACE\nf.txt\n<<<<<<< SEARCH\nzzz\n=======\nyyy\n>>>>>>> REPLACE\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 2 edits\n', { 'f.txt': F4 });
S('S36', 'f.txt\n<<<<<<< SEARCH\n\t\talpha\n=======\n\t\tALPHA\n>>>>>>> REPLACE\n', { 'f.txt': '\talpha\n\tbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '\tALPHA\n\tbeta\n' });
S('S37', 'f.txt\n<<<<<<< SEARCH\nbeta\n=======\nBETA\n>>>>>>> REPLACE\n', { 'f.txt': 'alpha\nbeta' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nBETA' });

// ---------- V4A ----------
function V(id, patch, files, exit, stdout, exp, argv = []) {
  C({ id, argv, stdin: patch, files, exit, stdout, exp });
}
V('V01', '*** Begin Patch\n*** Update File: f.txt\n@@ beta\n-gamma\n+gamma2\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\ngamma2\ndelta\n' });
V('V02', '*** Begin Patch\n*** Update File: f.txt\n-beta\n+beta2\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
V('V03', '*** Begin Patch\n*** Update File: f.txt\n@@\n-beta\n+beta2\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
V('V04', '*** Begin Patch\n*** Update File: f.txt\n@@ zzz\n-beta\n+beta2\n*** End Patch\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
V('V05', '*** Begin Patch\n*** Update File: f.txt\n@@ alpha\n-beta\n+BETA\n*** End Patch\n', { 'f.txt': 'alpha \nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha \nBETA\n' });
V('V06', '*** Begin Patch\n*** Update File: f.txt\n@@ alpha\n-beta\n+BETA\n*** End Patch\n', { 'f.txt': '  alpha\nbeta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  alpha\nBETA\n' });
V('V07', '*** Begin Patch\n*** Update File: f.txt\n@@ b\n-c\n+C\n@@ d\n-e\n+E\n*** End Patch\n', { 'f.txt': 'a\nb\nc\nd\ne\nf\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'a\nb\nC\nd\nE\nf\n' });
V('V08', '*** Begin Patch\n*** Update File: f.txt\n@@ b\n-c\n+C\n@@ b\n-e\n+E\n*** End Patch\n', { 'f.txt': 'a\nb\nc\nd\ne\nf\n' }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'a\nb\nc\nd\ne\nf\n' });
V('V09', '*** Begin Patch\n*** Update File: f.txt\n@@ gamma\n-delta\n+DELTA\n*** End of File\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\ngamma\nDELTA\n' });
V('V10', '*** Begin Patch\n*** Update File: f.txt\n@@ alpha\n-beta\n+beta2\n*** End of File\n*** End Patch\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
V('V11', '*** Begin Patch\n*** Update File: f.txt\n@@ delta\n+tail\n*** End of File\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\ngamma\ndelta\ntail\n' });
V('V12', '*** Begin Patch\n*** Update File: f.txt\n@@ beta\n+mid\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\nmid\ngamma\ndelta\n' });
V('V13', '*** Begin Patch\n*** Add File: new.txt\n+line1\n+line2\n*** End Patch\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'line1\nline2\n' });
V('V14', '*** Begin Patch\n*** Add File: new.txt\n+line1\n*** End Patch\n', { 'new.txt': 'old\n' }, 1, 'error: exists new.txt\nfailed: 1 of 1 edits\n', { 'new.txt': 'old\n' });
V('V15', '*** Begin Patch\n*** Add File: new.txt\n+line1\n\n+line2\n*** End Patch\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'line1\n\nline2\n' });
V('V16', '*** Begin Patch\n*** Add File: new.txt\n+line1\n\n*** End Patch\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'line1\n' });
V('V17', '*** Begin Patch\n*** Add File: new.txt\n+line1\n-bad\n*** End Patch\n', {}, 2, 'error: parse 4\n', {});
V('V18', '*** Begin Patch\n*** Add File: new.txt\n line1\n*** End Patch\n', {}, 2, 'error: parse 3\n', {});
V('V19', '*** Begin Patch\n*** Delete File: f.txt\n*** End Patch\n', { 'f.txt': 'x\n' }, 0, 'D f.txt\nok: 1 file\n', {});
V('V20', '*** Begin Patch\n*** Delete File: f.txt\n*** End Patch\n', {}, 1, 'error: missing f.txt\nfailed: 1 of 1 edits\n', {});
V('V21', '*** Begin Patch\n*** Delete File: f.txt\n+line1\n*** End Patch\n', { 'f.txt': 'x\n' }, 2, 'error: parse 3\n', { 'f.txt': 'x\n' });
V('V22', '*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n@@ alpha\n-beta\n+beta2\n*** End Patch\n', { 'old.txt': F4 }, 0, 'R old.txt -> new.txt\nok: 1 file\n', { 'new.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
V('V23', '*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n@@ alpha\n-beta\n+beta2\n*** End Patch\n', { 'old.txt': F4, 'new.txt': 'taken\n' }, 1, 'error: exists new.txt\nfailed: 1 of 1 edits\n', { 'old.txt': F4, 'new.txt': 'taken\n' });
V('V24', '*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n@@ alpha\n-beta\n+beta2\n*** End Patch\n', {}, 1, 'error: missing old.txt\nfailed: 1 of 1 edits\n', {});
V('V25', '*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n*** End Patch\n', { 'old.txt': F4 }, 0, 'R old.txt -> new.txt\nok: 1 file\n', { 'new.txt': F4 });
V('V26', '*** Begin Patch\n*** Update File: f.txt\n*** End Patch\n', { 'f.txt': F4 }, 2, 'error: parse 2\n', { 'f.txt': F4 });
V('V27', 'hello\n*** Begin Patch\n*** Update File: f.txt\n@@\n-x\n+y\n*** End Patch\n', { 'f.txt': 'x\n' }, 2, 'error: format\n', { 'f.txt': 'x\n' });
V('V28', '*** Update File: f.txt\n@@\n-x\n+y\n*** End Patch\n', { 'f.txt': 'x\n' }, 2, 'error: format\n', { 'f.txt': 'x\n' });
V('V29', '*** Begin Patch\n*** Update File: f.txt\n@@\n-x\n+y\n*** End Patch\ntrailing\n', { 'f.txt': 'x\n' }, 2, 'error: parse 8\n', { 'f.txt': 'x\n' });
V('V30', '*** Begin Patch\n*** Update File: f.txt\n@@\n-x\n+y\n', { 'f.txt': 'x\n' }, 2, 'error: parse 6\n', { 'f.txt': 'x\n' });
V('V31', '*** Begin Patch\n*** Add File: a.txt\n+hi\nbogus line\n*** End Patch\n', {}, 2, 'error: parse 4\n', {});
V('V32', '*** Begin Patch\n*** Add File: a.txt\n+hi\n\n*** Delete File: f.txt\n\n*** End Patch\n', { 'f.txt': 'gone\n' }, 0, 'A a.txt\nD f.txt\nok: 2 files\n', { 'a.txt': 'hi\n' });
V('V35', '*** Begin Patch\n*** Update File: f.txt\n@@\n   alpha\n-    beta\n+    BETA\n*** End Patch\n', { 'f.txt': '    alpha\n    beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '    alpha\n      BETA\n' });
V('V36', '*** Begin Patch\n*** Update File: f.txt\n@@\n-    alpha\n+    ALPHA\n+    extra\n*** End Patch\n', { 'f.txt': '  alpha\n  beta\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': '  ALPHA\n  extra\n  beta\n' });
V('V37', '*** Begin Patch\n*** Add File: ../evil.txt\n+hi\n*** End Patch\n', {}, 1, 'error: unsafe ../evil.txt\nfailed: 1 of 1 edits\n', {});
V('V38', '*** Begin Patch\n*** Update File: f.txt\n@@ alpha\n-beta\n+BETA\n*** End Patch\n', { 'f.txt': 'alpha \nbeta\n' }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'alpha \nbeta\n' }, ['--strict']);
V('V39', '*** Begin Patch\n*** Add File: a.txt\n+hi\n*** Update File: f.txt\n@@\n-beta\n+beta2\n*** Delete File: g.txt\n*** End Patch\n', { 'f.txt': F4, 'g.txt': 'gone\n' }, 0, 'A a.txt\nM f.txt\nD g.txt\nok: 3 files\n', { 'a.txt': 'hi\n', 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
V('V42', '*** Begin Patch\n*** Update File: f.txt\n@@\n-beta\n+beta2\n*** Move to: new.txt\n*** End Patch\n', { 'f.txt': F4 }, 2, 'error: parse 6\n', { 'f.txt': F4 });
V('V43', '*** Begin Patch\n*** Update File: f.txt\n@@\n-beta\n+beta2\n*** End of File\n-gamma\n+gamma2\n*** End Patch\n', { 'f.txt': F4 }, 2, 'error: parse 7\n', { 'f.txt': F4 });
V('V44', '*** Begin Patch\n*** Update File: f.txt\n*** End of File\n*** End Patch\n', { 'f.txt': F4 }, 2, 'error: parse 3\n', { 'f.txt': F4 });
V('V45', '*** Begin Patch\n*** Update File: f.txt\n-a\n+A\n*** End Patch\n', { 'f.txt': 'a\nx\na\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'A\nx\na\n' });
V('V46', '*** Begin Patch\n*** Update File: f.txt\n@@\n-beta\n+BETA\n*** End Patch\n', { 'f.txt': 'alpha\r\nbeta\r\ngamma\r\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\r\nBETA\r\ngamma\r\n' });
V('V47', '*** Begin Patch\n*** Update File: f.txt\n@@\n-beta\n+beta2\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': F4 }, ['--check']);
V('V48', '*** Begin Patch\n*** Add File:   new.txt   \n+hi\n*** End Patch\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'hi\n' });
V('V49', '*** Begin Patch\n*** Update File: f.txt\n@@ beta\n+mid\n*** End Patch\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta\nmid\ngamma\ndelta\n' });

// ---------- JSON edits (SPEC section 9, starter code) ----------
function J(id, patch, files, exit, stdout, exp, argv = []) {
  C({ id, argv, stdin: patch, files, exit, stdout, exp });
}
J('J01', '[{"command": "create", "path": "new.txt", "file_text": "hi\\nthere"}]\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'hi\nthere' });
J('J02', '[{"command": "create", "path": "new.txt", "file_text": "x"}]\n', { 'new.txt': 'old\n' }, 1, 'error: exists new.txt\nfailed: 1 of 1 edits\n', { 'new.txt': 'old\n' });
J('J03', '[{"command": "str_replace", "path": "f.txt", "old_str": "beta", "new_str": "beta2"}]\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
J('J04', '[{"command": "str_replace", "path": "f.txt", "old_str": "a", "new_str": "A"}]\n', { 'f.txt': 'a\nx\na\n' }, 1, 'error: ambiguous f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'a\nx\na\n' });
J('J05', '[{"command": "str_replace", "path": "f.txt", "old_str": "zzz", "new_str": "y"}]\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
J('J06', '[{"command": "str_replace", "path": "f.txt", "old_str": "beta", "new_str": "BETA"}]\n', { 'f.txt': 'alpha\r\nbeta\r\n' }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\r\nBETA\r\n' });
J('J07', '[{"command": "str_replace", "path": "f.txt", "old_str": "aa", "new_str": "b"}]\n', { 'f.txt': 'aaa\n' }, 1, 'error: ambiguous f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': 'aaa\n' });
J('J08', '[{"command": "insert", "path": "f.txt", "insert_line": 1, "new_str": "NEW"}]\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nNEW\nbeta\ngamma\ndelta\n' });
J('J09', '[{"command": "insert", "path": "f.txt", "insert_line": 5, "new_str": "NEW"}]\n', { 'f.txt': F4 }, 1, 'error: no-match f.txt\nfailed: 1 of 1 edits\n', { 'f.txt': F4 });
J('J10', '[{"command": "insert", "path": "f.txt", "insert_line": 2, "new_str": ""}]\n', { 'f.txt': F4 }, 0, 'ok: 0 files\n', { 'f.txt': F4 });
J('J11', '[{"command": "insert", "path": "f.txt", "insert_line": 1, "new_str": "X\\r\\nY"}]\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\nX\nY\nbeta\ngamma\ndelta\n' });
J('J12', '{"command": "create", "path": "a.txt", "file_text": "x"}\n{"command": "create", "path": "b.txt", "file_text": "y"}\n', {}, 0, 'A a.txt\nA b.txt\nok: 2 files\n', { 'a.txt': 'x', 'b.txt': 'y' });
J('J13', '[{"command": "create", "path": "a.txt", "file_text": "x"}, {"command": "str_replace", "path": "f.txt", "old_str": "beta", "new_str": "beta2"}]\n', { 'f.txt': F4 }, 0, 'A a.txt\nM f.txt\nok: 2 files\n', { 'a.txt': 'x', 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' });
J('J14', '[{bad json\n', {}, 2, 'error: parse 1\n', {});
J('J15', '{"command": "create", "path": "a.txt", "file_text": "x"}\nnot json\n', {}, 2, 'error: parse 2\n', {});
J('J16', '[{"command": "explode", "path": "f.txt"}]\n', { 'f.txt': F4 }, 2, 'error: parse 1\n', { 'f.txt': F4 });
J('J17', '[{"command": "str_replace", "path": "f.txt", "new_str": "y"}]\n', { 'f.txt': F4 }, 2, 'error: parse 1\n', { 'f.txt': F4 });
J('J18', '[{"command": "insert", "path": "f.txt", "insert_line": "1", "new_str": "x"}]\n', { 'f.txt': F4 }, 2, 'error: parse 1\n', { 'f.txt': F4 });
J('J19', '[{"command": "create", "path": "new.txt", "file_text": "x", "extra": 1}]\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'x' });
J('J20', '[{"command": "create", "path": "new.txt", "file_text": "no newline"}]\n', {}, 0, 'A new.txt\nok: 1 file\n', { 'new.txt': 'no newline' });
J('J21', '[{"command": "str_replace", "path": "f.txt", "old_str": "beta"}]\n', { 'f.txt': F4 }, 0, 'M f.txt\nok: 1 file\n', { 'f.txt': 'alpha\n\ngamma\ndelta\n' });
J('J22', '[1]\n', {}, 2, 'error: parse 1\n', {});
J('J23', '\n{"command": "create", "path": "a.txt", "file_text": "x"}\n\n', {}, 0, 'A a.txt\nok: 1 file\n', { 'a.txt': 'x' });

// ---------- CLI, invocation, output order ----------
C({ id: 'C01', argv: ['--bogus'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C02', argv: ['--format=bad'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C03', argv: ['--check', '--check'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C04', argv: ['a.patch', 'b.patch'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C05', argv: ['-x'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C06', argv: ['--', '--check'], stdin: '', files: {}, exit: 2, stdout: 'error: no-patch\n', exp: {} });
C({ id: 'C07', argv: ['-'], stdin: HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', files: { 'f.txt': F4 }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' } });
C({ id: 'C08', argv: ['nope.patch'], stdin: null, files: {}, exit: 2, stdout: 'error: no-patch\n', exp: {} });
C({ id: 'C09', argv: [], stdin: 'just some prose\nno format here\n', files: {}, exit: 2, stdout: 'error: format\n', exp: {} });
C({ id: 'C10', argv: ['--format=unified'], stdin: '[{"command": "create", "path": "a.txt", "file_text": "x"}]\n', files: {}, exit: 2, stdout: 'error: parse 1\n', exp: {} });
C({ id: 'C11', argv: ['--format=json'], stdin: HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', files: { 'f.txt': F4 }, exit: 2, stdout: 'error: parse 1\n', exp: { 'f.txt': F4 } });
C({ id: 'C12', argv: [], stdin: 'diff --git a/B.txt b/B.txt\n--- a/B.txt\n+++ b/B.txt\n@@ -1,1 +1,1 @@\n-x\n+x2\ndiff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-y\n+y2\n', files: { 'B.txt': 'x\n', 'a.txt': 'y\n' }, exit: 0, stdout: 'M B.txt\nM a.txt\nok: 2 files\n', exp: { 'B.txt': 'x2\n', 'a.txt': 'y2\n' } });
C({ id: 'C16', argv: ['--check'], stdin: 'f.txt\n<<<<<<< SEARCH\nzzz\n=======\nyyy\n>>>>>>> REPLACE\n', files: { 'f.txt': F4 }, exit: 1, stdout: 'error: no-match f.txt\nfailed: 1 of 1 edits\n', exp: { 'f.txt': F4 } });
C({ id: 'C18', argv: ['p.patch'], stdin: null, files: { 'p.patch': HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', 'f.txt': F4 }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'p.patch': HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' } });
C({ id: 'C19', argv: [], stdin: '', files: {}, exit: 2, stdout: 'error: format\n', exp: {} });
C({ id: 'C20', argv: [], stdin: '\n\n  \n', files: {}, exit: 2, stdout: 'error: format\n', exp: {} });
C({ id: 'C21', argv: ['--format=auto'], stdin: HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', files: { 'f.txt': F4 }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' } });
C({ id: 'C22', argv: ['sub/p.patch'], stdin: null, files: { 'sub/p.patch': HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', 'f.txt': F4 }, exit: 0, stdout: 'M f.txt\nok: 1 file\n', exp: { 'sub/p.patch': HDR + '@@ -2,1 +2,1 @@\n-beta\n+beta2\n', 'f.txt': 'alpha\nbeta2\ngamma\ndelta\n' } });
C({ id: 'C23', argv: ['--bogus', 'missing.patch'], stdin: null, files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });
C({ id: 'C24', argv: ['--format=unified', '--format=json'], stdin: '', files: {}, exit: 2, stdout: 'error: usage\n', exp: {} });

// ---------- runner ----------
let pass = 0;
let fail = 0;
for (const c of cases) {
  const got = runCheck({ id: c.id, argv: c.argv, stdin: c.stdin ?? null, files: c.files });
  const why = [];
  if (got.exit !== c.exit) why.push(`exit ${got.exit} != ${c.exit}`);
  if (got.stdout !== c.stdout) why.push(`stdout ${JSON.stringify(got.stdout)} != ${JSON.stringify(c.stdout)}`);
  for (const k of new Set([...Object.keys(c.exp), ...Object.keys(got.files)])) {
    if (c.exp[k] === undefined) why.push(`${k} should not exist (got ${JSON.stringify(got.files[k])})`);
    else if (got.files[k] === undefined) why.push(`${k} missing`);
    else if (got.files[k] !== c.exp[k]) why.push(`${k} differs: got ${JSON.stringify(got.files[k])} want ${JSON.stringify(c.exp[k])}`);
  }
  if (why.length === 0) pass += 1;
  else { fail += 1; process.stdout.write(`FAIL ${c.id}\n  ${why.join('\n  ')}\n`); }
}
process.stdout.write(`${pass} of ${cases.length} passed\n`);
process.exitCode = fail === 0 ? 0 : 1;
