import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, linkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/night-review.mjs');
const scratch = join(root, 'outputs');
const environment = {...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0'};

function fixture(t) {
  mkdirSync(scratch, {recursive: true});
  const directory = mkdtempSync(join(scratch, 'night-review-test-'));
  t.after(() => {
    assert.ok(directory.startsWith(scratch + sep + 'night-review-test-'));
    rmSync(directory, {recursive: true, force: true});
  });
  const repo = join(directory, 'repo');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', windowsHide: true, env: environment, stdio: ['ignore', 'pipe', 'pipe']}).trimEnd();
  const write = (path, contents) => { mkdirSync(dirname(join(repo, path)), {recursive: true}); writeFileSync(join(repo, path), contents, 'utf8'); };
  const commit = subject => { git('add', '-A'); git('commit', '-m', subject); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=night-fixture');
  git('config', 'user.name', 'Night Review Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  write('README.md', 'Fixture only\n');
  write('ops/night/out/.gitkeep', '');
  write('tests/unknown.test.mjs', "test('unknown stays null', () => {\n  assert.equal(weight({}), null);\n});\nconst existing = true;\n");
  write('desktop/test/retained.test.mjs', "describe('retained', () => {});\n");
  write('package.json', JSON.stringify({dependencies: {zod: '1'}, devDependencies: {typescript: '1'}, scripts: {test: 'node --test'}}, null, 2) + '\n');
  write('desktop/package.json', JSON.stringify({optionalDependencies: {example: '1'}, peerDependencies: {example: '1'}}) + '\n');
  write('lib/lab/muse-workflows.ts', 'export const prompt = "Hi";\n');
  const base = commit('baseline fixture');
  git('update-ref', 'refs/remotes/origin/main', base);
  const report = (id, status = 'done', extra = '') => write('ops/night/out/reports/' + id + '.md', '=== BAO CAO ' + id + ' ===\nTRANG THAI: ' + status + '\n' + extra + '\n');
  const run = (args = [], useDefault = false) => spawnSync(process.execPath, [script, ...(useDefault ? [] : ['--repo', repo, ...(args.includes('--out') ? [] : ['--out', '../review.md'])]), ...args], {cwd: repo, encoding: 'utf8', windowsHide: true, env: environment});
  const review = () => readFileSync(join(directory, 'review.md'), 'utf8');
  return {directory, repo, git, write, commit, report, run, review};
}

function row(markdown, id, sha) {
  const line = markdown.split('\n').find(line => line.startsWith('| ' + id + ' | `' + sha.slice(0, 12) + '` |'));
  assert.ok(line, 'Missing row for ' + id + ' ' + sha);
  return line;
}

function tree(directory, prefix = '') {
  const result = {};
  for (const entry of readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name, path = join(directory, entry.name), stat = lstatSync(path);
    if (entry.isDirectory()) { result[name + '/'] = 'directory'; Object.assign(result, tree(path, name + '/')); }
    else result[name] = {hash: createHash('sha256').update(readFileSync(path)).digest('hex'), mode: stat.mode, mtime: stat.mtimeMs};
  }
  return result;
}

test('good and bad tasks, report-only auth failure, exact revert, reimplementation and F01 are classified per commit', t => {
  const f = fixture(t);
  f.write('lib/good.mjs', 'export const weight = c => c.weightKg ?? null;\n');
  f.write('tests/good.test.mjs', "test('weight remains unknown', () => assert.equal(weight({}), null));\n");
  f.report('T01', 'done', 'FILE: lib/good.mjs; tests/good.test.mjs');
  const good = f.commit('night T01: good');

  f.write('lib/bad.mjs', 'export function weight(c){return c.weightKg ?? 0}\n');
  f.write('tests/unknown.test.mjs', 'const existing = true;\n');
  f.report('T02', 'done', 'FILE: tests/imaginary.test.mjs');
  const bad = f.commit('night T02: bad');

  f.report('T03', 'done', 'Unexpected status 403');
  const reportOnly = f.commit('night T03: report only');

  f.write('lib/reverted.mjs', 'export const value = null;\n');
  f.report('T04');
  const reverted = f.commit('night T04: implementation');
  f.git('revert', '--no-edit', reverted);
  f.write('lib/reverted.mjs', 'export const value = null; // retry\n');
  f.report('T04');
  const retried = f.commit('night T04: implementation');

  f.write('lib/fix.mjs', 'export const corrected = true;\n');
  f.report('F01', 'partial');
  const fix = f.commit('night F01: correction');
  f.report('F02');
  const revertedFix = f.commit('night F02: revert fixture');
  f.git('revert', '--no-edit', revertedFix);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const markdown = f.review();
  assert.match(row(markdown, 'T01', good), /\| done \| Không \|/);
  const badRow = row(markdown, 'T02', bad);
  assert.match(badRow, /Dòng test bị xóa: 2; tests\/unknown.test.mjs \(2\)/);
  assert.match(badRow, /Mặc định 0 ngoài test: lib\/bad.mjs:1/);
  assert.match(badRow, /báo cáo nhắc file không có trong diff: tests\/imaginary.test.mjs/);
  assert.equal(badRow.split('<br>').length, 3, 'Exactly the three expected flags');
  assert.match(row(markdown, 'T03', reportOnly), /\| Chưa làm \|/);
  assert.match(row(markdown, 'T04', reverted), /\| Đã bỏ \|/);
  assert.match(row(markdown, 'T04', retried), /\| done \|/);
  assert.match(row(markdown, 'F01', fix), /\| partial \| Không \|/);
  assert.match(row(markdown, 'F02', revertedFix), /\| Đã bỏ \|/);
  assert.match(markdown, /ops\/night\/fix\/&lt;vòng&gt;\/F01-\*\.md/);
  assert.ok(markdown.startsWith('Đây là kiểm máy móc. Vẫn cần review nội dung theo skill hermes-night-review trước khi áp vào app chính.'));
});

test('invalid or absent report and auth text cannot become done; partial and blocked stay explicit', t => {
  const f = fixture(t), commits = [];
  for (const [id, content, expected] of [
    ['T10', 'TRANG THAI: done\n', 'Chưa làm'],
    ['T11', '=== BAO CAO T11 ===\ntruncated log\n', 'Chưa làm'],
    ['T12', '=== BAO CAO T12 ===\nTRANG THAI: done\n401 Unauthorized\n', 'Chưa làm'],
    ['T13', '=== BAO CAO T13 ===\nTRANG THAI: done\nKhóa hết hạn\n', 'Chưa làm'],
    ['T14', '=== BAO CAO T14 ===\nTRANG THAI: blocked\n', 'blocked'],
    ['T15', '=== BAO CAO T15 ===\nTRANG THAI: partial\n', 'partial'],
    ['T16', '=== BAO CAO T16 ===\nTRANG THAI: done | partial | blocked\n', 'Chưa làm'],
    ['T17', '=== BAO CAO F17 ===\nTRANG THAI: done\n', 'Chưa làm'],
    ['T18', '=== BAO CAO T18 ===\nTRANG THAI: done\n', 'Chưa làm'],
  ]) {
    f.write('ops/night/out/reports/' + id + '.md', content);
    commits.push([id, f.commit('night ' + id + ': ' + (id === 'T18' ? 'report only' : 'report fixture')), expected]);
  }
  f.write('lib/no-report.mjs', 'export const value = null;\n');
  commits.push(['T19', f.commit('night T19: no report'), 'Chưa làm']);
  assert.equal(f.run().status, 0);
  for (const [id, sha, status] of commits) assert.ok(row(f.review(), id, sha).includes('| ' + status + ' |'));
});

test('runner logs bind SHA and last attempt, not earlier failures or unrelated runs', t => {
  const f = fixture(t), commits = {};
  for (const id of ['T01', 'T02', 'F01', 'T03']) { f.report(id); commits[id] = f.commit('night ' + id + ': log fixture'); }
  f.write('runs/old/runner.log', '[01:00] ==== T01 old attempt\n[01:00] codex start (T01-a1)\n[01:01] codex exit 9\n[01:01] T01 DONE deadbee\n');
  f.write('runs/current/runner.log', [
    '[02:00] ==== T01 retry', '[02:00] codex start (T01-a1)', '[02:01] 403', '[02:01] codex exit 7',
    '[02:02] codex start (T01-a2)', '[02:03] codex exit 0', '[02:04] T01 DONE ' + commits.T01.slice(0, 7),
    '[02:05] ==== T02 failure', '[02:05] codex start (T02-a1)', '[02:06] codex exit -999', '[02:07] T02 DONE ' + commits.T02.slice(0, 7),
    '[02:08] ==== F01 fix', '[02:08] codex start (F01-a1)', '[02:09] codex exit 0', '[02:10] F01 PARTIAL ' + commits.F01.slice(0, 7),
    '[02:11] ==== T03 auth', '[02:11] codex start (T03-a1)', '[02:12] 401 Unauthorized', '[02:12] codex exit 0', '[02:13] T03 DONE ' + commits.T03.slice(0, 7),
  ].join('\n'));
  assert.equal(f.run(['--runs', 'runs']).status, 0);
  const markdown = f.review();
  assert.match(row(markdown, 'T01', commits.T01), /\| done \|/);
  assert.match(row(markdown, 'T02', commits.T02), /\| Chưa làm \|/);
  assert.match(markdown, /T02-a1 codex exit -999/);
  assert.match(row(markdown, 'F01', commits.F01), /\| done \|/);
  assert.match(row(markdown, 'T03', commits.T03), /\| Chưa làm \|/);
  assert.match(markdown, /T01-a2/);
});

test('flags forbidden paths, semantic dependency edits, Unicode prompt length and added zero lines with exact numbers', t => {
  const f = fixture(t);
  const paths = ['data/fixture.json', 'evidence/fixture.txt', 'ops/night/tasks/T01.md', 'ops/night/input/fixture.txt', 'ops/night/fix/round/F01.md', 'ops/night/COMMON.md', 'ops/night/RUN-NIGHT.ps1', 'desktop/local-dist/app.js', 'pnpm-lock.yaml', 'desktop/package-lock.json', '.github/workflows/ci.yml', '.claude/skills/example/SKILL.md'];
  for (const path of paths) f.write(path, 'fixture\n');
  f.write('package.json', JSON.stringify({dependencies: {zod: '2'}, devDependencies: {typescript: '1'}, scripts: {test: 'node --test'}}) + '\n');
  f.write('desktop/package.json', JSON.stringify({optionalDependencies: {example: '2'}, peerDependencies: {example: '2'}}) + '\n');
  const oldPrompt = 'export const prompt = "Hi";\n', newPrompt = 'export const prompt = "Hi 😀";\n';
  f.write('lib/lab/muse-workflows.ts', newPrompt);
  f.write('lib/cân nặng.mjs', '// header\nexport const a = c => c.weightKg ?? 0;\nexport const b = c => c.weightKg || 0;\nexport const c = z.number().default(0);\nexport const d = c => c.weightKg ?? 0.5;\n');
  f.write('tests/zero-fixture.test.mjs', 'const fixture = value ?? 0;\n');
  f.write('desktop/test/zero-fixture.test.mjs', 'const fixture = value || 0;\n');
  f.write('desktop/test/retained.test.mjs', 'const remaining = true;\n');
  f.report('F02');
  const sha = f.commit('night F02: forbidden fixture');
  assert.equal(f.run().status, 0);
  const line = row(f.review(), 'F02', sha);
  for (const path of paths) assert.ok(line.includes('Đường cấm: ' + path), path);
  assert.match(line, /Đổi dependency: package.json \(dependencies\)/);
  assert.match(line, /Đổi dependency: desktop\/package.json \(optionalDependencies, peerDependencies\)/);
  assert.ok(line.includes('Muse workflows: ' + [...oldPrompt].length + ' → ' + [...newPrompt].length + ' ký tự (+2)'));
  assert.ok(line.includes('Mặc định 0 ngoài test: lib/cân nặng.mjs:2, lib/cân nặng.mjs:3, lib/cân nặng.mjs:4'));
  assert.ok(!line.includes('cân nặng.mjs:5'));
  assert.ok(!line.includes('zero-fixture.test.mjs'));
  assert.match(line, /Dòng test bị xóa: 1; desktop\/test\/retained.test.mjs \(1\)/);
});

test('package formatting and scripts do not imply dependency changes; changed test mentions support backslashes', t => {
  const f = fixture(t);
  f.write('package.json', JSON.stringify({scripts: {test: 'node --test tests/one.test.mjs'}, devDependencies: {typescript: '1'}, dependencies: {zod: '1'}}) + '\n');
  f.write('tests/one.test.mjs', "it('one', () => assert.ok(true));\n");
  f.report('T20', 'done', 'FILE: `tests\\one.test.mjs:1`');
  const sha = f.commit('night T20: scripts only');
  assert.equal(f.run().status, 0);
  assert.match(row(f.review(), 'T20', sha), /\| done \| Không \|/);
});

test('report brace lists expand into complete test filenames before checking the diff', t => {
  const f = fixture(t);
  f.write('tests/one.test.mjs', "test('one', () => assert.ok(true));\n");
  f.write('tests/two.test.mjs', "test('two', () => assert.ok(true));\n");
  f.write('desktop/test/three.test.mjs', "test('three', () => assert.ok(true));\n");
  f.report('T21', 'done', 'FILE: tests/{one.test.mjs,two.test.mjs}; desktop/test/{three.test.mjs,missing.test.mjs}');
  const sha = f.commit('night T21: brace report');
  assert.equal(f.run().status, 0);
  assert.match(row(f.review(), 'T21', sha), /\| done \| báo cáo nhắc file không có trong diff: desktop\/test\/missing.test.mjs \|/);
});

test('read-only review preserves HEAD, branch, nonempty stash, staged/dirty files, status and every file except out', t => {
  const f = fixture(t);
  f.report('T01');
  f.commit('night T01: read only fixture');
  f.write('stashed.txt', 'retained stash\n');
  f.git('stash', 'push', '-u', '-m', 'night-FAILED-T99 fixture');
  f.write('README.md', 'unstaged change\n');
  f.write('staged.txt', 'staged content\n');
  f.git('add', 'staged.txt');
  f.write('untracked.txt', 'untracked content\n');
  f.write('ops/night/out/AUTO-REVIEW.md', 'previous review\n');
  const state = () => ({head: f.git('rev-parse', 'HEAD'), branch: f.git('branch', '--show-current'), stash: f.git('stash', 'list'), status: f.git('status', '--porcelain=v1', '--untracked-files=all')});
  const beforeState = state(), beforeTree = tree(f.directory);
  assert.notEqual(beforeState.stash, '');
  const result = f.run([], true);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(state(), beforeState);
  const afterTree = tree(f.directory), out = 'repo/ops/night/out/AUTO-REVIEW.md';
  assert.notEqual(afterTree[out].hash, beforeTree[out].hash);
  delete beforeTree[out]; delete afterTree[out];
  assert.deepEqual(afterTree, beforeTree);
  const markdown = readFileSync(join(f.repo, 'ops/night/out/AUTO-REVIEW.md'), 'utf8');
  const last = markdown.trimEnd().split('\n').at(-1);
  assert.match(last, /Trước \[HEAD=.*Sau \[HEAD=.*Xác nhận HEAD, nhánh và git stash list không đổi\./);
  assert.ok(last.includes(beforeState.head));
  assert.ok(last.includes('night-fixture'));
  assert.ok(last.includes('night-FAILED-T99 fixture'));
});

test('CLI rejects bad arguments, non-repo, bad refs and metadata/hardlink outputs without writing files', t => {
  const f = fixture(t), before = tree(f.directory);
  for (const args of [['--unknown', 'x'], ['--base'], ['--base', 'missing-ref'], ['--branch', '--help'], ['--repo', f.directory], ['--out', '.git/config'], ['--out', 'missing-parent/review.md'], ['--runs', 'missing-runs']]) {
    const result = spawnSync(process.execPath, [script, ...(args.includes('--repo') ? [] : ['--repo', f.repo]), ...args], {cwd: f.directory, encoding: 'utf8', env: environment});
    assert.notEqual(result.status, 0, JSON.stringify(args));
  }
  assert.deepEqual(tree(f.directory), before);
  linkSync(join(f.repo, 'README.md'), join(f.directory, 'linked.md'));
  const linkedBefore = tree(f.directory);
  assert.notEqual(f.run(['--out', '../linked.md']).status, 0);
  assert.deepEqual(tree(f.directory), linkedBefore);
});

test('explicit base/branch reviews committed branch, ignoring a dirty working report and later commits', t => {
  const f = fixture(t);
  f.report('T01', 'blocked');
  const first = f.commit('night T01: initial');
  f.report('T01', 'done');
  const second = f.commit('night T01: fixed');
  f.report('T01', 'done', '403 in dirty report must not affect old commit');
  assert.equal(f.run(['--base', 'origin/main', '--branch', first]).status, 0);
  assert.match(row(f.review(), 'T01', first), /\| blocked \|/);
  assert.ok(!f.review().includes(second.slice(0, 12) + '` |'));
});
