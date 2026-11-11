import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync, readdirSync, lstatSync, realpathSync, writeFileSync} from 'node:fs';
import {resolve, dirname, basename, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const usage = 'node scripts/night-review.mjs [--repo .] [--base origin/main] [--branch HEAD] [--out ops/night/out/AUTO-REVIEW.md] [--runs <thư mục runs>]';
const authError = /\b(?:401|403)\b|hết\s+hạn/iu;
const dependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'overrides', 'resolutions'];
const forbidden = /^(?:data\/|evidence\/|ops\/night\/(?:tasks\/|input\/|fix\/|COMMON\.md$|RUN-NIGHT\.ps1$)|desktop\/local-dist\/|\.github\/|\.claude\/)|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?)$/i;
const testPath = path => /(?:^|\/)(?:tests?|__tests__)\//.test(path);
const countedTestPath = path => /^(?:tests\/|desktop\/test\/)/.test(path);
const md = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('`', '&#96;').replace(/\r?\n/g, '<br>');
const code = value => '`' + md(value) + '`';

function parseArgs(argv) {
  const options = {repo: '.', base: 'origin/main', branch: 'HEAD', out: 'ops/night/out/AUTO-REVIEW.md'};
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].slice(2), value = argv[i + 1];
    if (!/^--(?:repo|base|branch|out|runs)$/.test(argv[i]) || seen.has(name) || !value || value.startsWith('--') || value.includes('\0')) {
      throw Error('Tham số không hợp lệ. ' + usage);
    }
    seen.add(name);
    options[name] = value;
  }
  options.repo = resolve(options.repo);
  return options;
}

function gitReader(repo) {
  return (...args) => {
    // No shell, hooks, textconv, external diff, lazy fetch or optional index locks.
    const allowed = ['log', 'show', 'diff', 'rev-parse'].includes(args[0]) ||
      isDeepStrictEqual(args, ['branch', '--show-current']) || isDeepStrictEqual(args, ['stash', 'list']);
    if (!allowed) throw Error('Lệnh Git nằm ngoài danh sách chỉ đọc');
    return execFileSync('git', ['--no-pager', '--literal-pathspecs', '-C', repo, ...args], {
      encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0'},
    });
  };
}

function snapshot(git) {
  return {head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(), stash: git('stash', 'list').trimEnd()};
}

function validate(options, git) {
  try { git('rev-parse', '--show-toplevel'); }
  catch { throw Error('--repo không phải repository Git có working tree'); }
  for (const key of ['base', 'branch']) {
    try { options[key + 'Sha'] = git('rev-parse', '--verify', '--end-of-options', options[key] + '^{commit}').trim(); }
    catch { throw Error('--' + key + ' không trỏ tới commit: ' + options[key]); }
  }
  options.out = resolve(options.repo, options.out);
  // Do not create directories or follow an output symlink/hardlink into another file.
  const parent = realpathSync(dirname(options.out));
  const destination = resolve(parent, basename(options.out));
  for (const arg of ['--absolute-git-dir', '--git-common-dir']) {
    const metadata = realpathSync(resolve(options.repo, git('rev-parse', arg).trim()));
    const path = relative(metadata, destination);
    if (!path || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path))) throw Error('--out không được nằm trong metadata Git');
  }
  try {
    const stat = lstatSync(options.out);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('--out phải là file thường, không phải symlink/hardlink');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (options.runs) {
    options.runs = resolve(options.repo, options.runs);
    if (!lstatSync(options.runs).isDirectory()) throw Error('--runs phải là thư mục thường');
  }
}

function commitsInRange(git, range) {
  const fields = git('log', '--reverse', '--topo-order', '--format=%H%x00%P%x00%s%x00%B%x00', range, '--').split('\0');
  const commits = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    commits.push({sha: fields[i].trim(), parent: fields[i + 1].split(' ')[0], subject: fields[i + 2], body: fields[i + 3]});
  }
  return commits;
}

function readBlob(git, sha, path) {
  if (!sha) return null;
  try { return git('show', sha + ':' + path); }
  catch (error) {
    // Missing files are expected for additions, deletions and absent reports.
    if (/does not exist|exists on disk, but not in|not exist in/i.test(String(error.stderr))) return null;
    throw error;
  }
}

function diff(git, commit, args, paths = []) {
  const common = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', ...args];
  return commit.parent
    ? git('diff', ...common, commit.parent, commit.sha, '--', ...paths)
    : git('show', '--format=', '--root', ...common, commit.sha, '--', ...paths);
}

// A failed a1 must not contaminate the successful a2 that the runner committed.
// Only a completion line with the same task AND SHA can associate a log to a commit.
function readRuns(root, warnings) {
  const runs = [];
  if (!root) return runs;
  function visit(directory) {
    let entries;
    try { entries = readdirSync(directory, {withFileTypes: true}); }
    catch { warnings.push('Không đọc được thư mục log: ' + directory); return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile() || entry.name !== 'runner.log') continue;
      try {
        let task = null, attempt = null;
        for (const [index, line] of readFileSync(path, 'utf8').split(/\r?\n/).entries()) {
          const startTask = line.match(/====\s+([TF]\d{2})\b/);
          if (startTask) { task = startTask[1]; attempt = null; }
          const start = line.match(/codex start\s*\(([TF]\d{2})(-a\d+)?\)/i);
          if (start) { task = start[1]; attempt = {tag: task + (start[2] ?? ''), exit: null, auth: false}; }
          const exit = line.match(/codex exit\s*[:=]?\s*(-?\d+)\b/i);
          if (exit && task) {
            attempt ??= {tag: task, exit: null, auth: false};
            attempt.exit = Number(exit[1]);
          }
          if (attempt && authError.test(line)) attempt.auth = true;
          const completed = line.match(/\b([TF]\d{2})\s+(?:DONE|PARTIAL|NOCHANGE)\s+([0-9a-f]{7,40})\b/i);
          if (completed) {
            if (task === completed[1] && attempt) runs.push({...attempt, task, sha: completed[2], path, line: index + 1});
            task = null; attempt = null;
          }
        }
      } catch { warnings.push('Không đọc được runner.log: ' + path); }
    }
  }
  visit(root);
  return runs;
}

function mentionedTests(report) {
  // Reports often shorten FILE lists as tests/{one.test.mjs,two.test.mjs}.
  const expanded = (report ?? '').replaceAll('\\', '/').replace(
    /\b((?:desktop\/test|tests)\/[^\s`{}]*?)\{([^{}\r\n]+)\}([^\s`<>"'()[\],;]*)/g,
    (_, prefix, names, suffix) => names.split(',').map(name => prefix + name.trim() + suffix).join(' '),
  );
  return new Set(expanded.match(/\b(?:desktop\/test|tests)\/[^\s`<>"'()[\]{},;]+\.[a-zA-Z0-9]+/g) ?? []);
}

function reviewCommit(git, commit, runs, withRuns) {
  const task = commit.subject.match(/^night ([TF]\d{2}):/)[1];
  const reportPath = 'ops/night/out/reports/' + task + '.md';
  const report = readBlob(git, commit.sha, reportPath);
  const reasons = [], flags = [];
  const header = new RegExp('^\\s*=== BAO CAO ' + task + ' ===\\s*$', 'm');
  const block = report?.match(header);
  const statusLine = block && report.slice(block.index + block[0].length).match(/^\s*TRANG THAI:[ \t]*(.*)$/m);
  const status = statusLine?.[1].trim().toLowerCase();
  if (/\breport only\b/i.test(commit.subject)) reasons.push('Commit report only');
  if (!block) reasons.push('Thiếu dòng === BAO CAO ' + task + ' === trong báo cáo tại commit');
  if (!statusLine) reasons.push('Thiếu dòng TRANG THAI: sau đầu báo cáo');
  else if (!['done', 'partial', 'blocked'].includes(status)) reasons.push('Giá trị TRANG THAI không hợp lệ');
  if (report && authError.test(report)) reasons.push('Báo cáo có 401/403/hết hạn');
  const matchedRuns = runs.filter(run => run.task === task && commit.sha.startsWith(run.sha));
  for (const run of matchedRuns) {
    if (run.exit !== null && run.exit !== 0) reasons.push('runner.log: ' + run.tag + ' codex exit ' + run.exit);
    if (run.auth) reasons.push('runner.log: ' + run.tag + ' có 401/403/hết hạn');
  }
  const files = diff(git, commit, ['--name-only', '-z']).split('\0').filter(Boolean);
  const codeFiles = files.filter(path => !path.startsWith('ops/night/out/') && !/^(?:docs\/)|\.(?:md|txt|log|png|jpe?g)$/i.test(path));
  const removed = [], zeroes = [];
  for (const path of files) {
    if (forbidden.test(path)) flags.push('Đường cấm: ' + path);
    let count = 0, lineNumber = null;
    const patch = diff(git, commit, ['--unified=0'], [path]);
    for (const line of patch.split('\n')) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) { lineNumber = Number(hunk[1]); continue; }
      if (lineNumber === null) continue;
      if (line.startsWith('-')) {
        if (countedTestPath(path) && /\b(?:test|it|describe)\s*\(|\bassert\b/.test(line.slice(1))) count++;
      } else if (line.startsWith('+')) {
        if (!testPath(path) && /(?:\?\?|\|\|)\s*0(?![\w.]|[eE][+-])|\.default\s*\(\s*0\s*\)/.test(line.slice(1))) zeroes.push(path + ':' + lineNumber);
        lineNumber++;
      } else if (line.startsWith(' ')) lineNumber++;
    }
    if (count) removed.push({path, count});
    if (['package.json', 'desktop/package.json'].includes(path)) {
      try {
        const before = JSON.parse(readBlob(git, commit.parent, path) ?? '{}');
        const after = JSON.parse(readBlob(git, commit.sha, path) ?? '{}');
        const changed = dependencyKeys.filter(key => !isDeepStrictEqual(before[key], after[key]));
        if (changed.length) flags.push('Đổi dependency: ' + path + ' (' + changed.join(', ') + ')');
      } catch { flags.push('Không kiểm được dependency: ' + path + ' (JSON không đọc được)'); }
    }
    if (path === 'lib/lab/muse-workflows.ts') {
      const before = [...(readBlob(git, commit.parent, path) ?? '')].length;
      const after = [...(readBlob(git, commit.sha, path) ?? '')].length;
      flags.push('Muse workflows: ' + before + ' → ' + after + ' ký tự (' + (after >= before ? '+' : '') + (after - before) + ')');
    }
  }
  if (removed.length) flags.push('Dòng test bị xóa: ' + removed.reduce((sum, file) => sum + file.count, 0) + '; ' + removed.map(file => file.path + ' (' + file.count + ')').join(', '));
  if (zeroes.length) flags.push('Mặc định 0 ngoài test: ' + zeroes.join(', '));
  const absent = [...mentionedTests(report)].filter(path => !files.includes(path));
  if (absent.length) flags.push('báo cáo nhắc file không có trong diff: ' + absent.join(', '));
  return {...commit, task, reportPath, reportExists: report !== null, status: reasons.length ? 'Chưa làm' : status, reasons, flags, files, codeFiles, matchedRuns, withRuns};
}

function markReverts(tasks, commits) {
  for (const [index, commit] of commits.entries()) {
    const match = commit.subject.match(/^Revert "(night [TF]\d{2}: .+)"$/);
    if (!match) continue;
    const target = commit.body.match(/This reverts commit ([0-9a-f]{40})\./i)?.[1];
    const previous = new Set(commits.slice(0, index).map(item => item.sha));
    // Standard Git revert identifies one exact commit; subject fallback uses the latest match.
    const candidates = tasks.filter(task => previous.has(task.sha) && (target ? task.sha === target : task.subject === match[1]));
    const reverted = candidates.at(-1);
    if (reverted) {
      reverted.status = 'Đã bỏ';
      reverted.reasons.push('Bị revert bởi ' + commit.sha);
    }
  }
}

function render(options, tasks, warnings, before, after) {
  const lines = [
    'Đây là kiểm máy móc. Vẫn cần review nội dung theo skill hermes-night-review trước khi áp vào app chính.', '',
    '# Tự review đêm', '',
    'Phạm vi: ' + code(options.base + '..' + options.branch) + '; SHA đã chốt: ' + code(options.baseSha + '..' + options.branchSha) + '.',
    'Mỗi dòng là một commit; báo cáo được đọc tại commit đó. Cờ là dấu hiệu cần đọc diff, không phải kết luận chất lượng. Không kiểm GUI, Muse, Instagram hoặc tiêu chí nghiệp vụ.',
    'Log chỉ được gắn khi có mã task và SHA commit; dùng lượt cuối trước dòng hoàn tất. Không suy trạng thái từ log khác lượt hoặc chỉ từ thời gian.', '',
    '| Task | Commit | Trạng thái máy đọc | Cờ | Báo cáo |',
    '| --- | --- | --- | --- | --- |',
    ...tasks.map(task => '| ' + task.task + ' | ' + code(task.sha.slice(0, 12)) + ' | ' + task.status + ' | ' + (task.flags.length ? task.flags.map(md).join('<br>') : 'Không') + ' | ' + code(task.reportPath) + (task.reportExists ? '' : ' (thiếu)') + ' |'),
    '',
  ];
  if (!tasks.length) lines.push('Không có commit night Txx/Fxx trong phạm vi.', '');
  if (warnings.length) lines.push('## Phần chưa kiểm được', '', ...warnings.map(warning => '- ' + md(warning)), '');
  for (const task of tasks) {
    lines.push('## ' + task.task + ' · ' + task.sha.slice(0, 12), '',
      '- Commit: ' + md(task.subject) + '.', '- Trạng thái máy đọc: **' + task.status + '**.',
      '- Báo cáo: ' + code(task.sha + ':' + task.reportPath) + (task.reportExists ? '.' : ' (thiếu).'),
      '- Spec cần review nội dung: ' + code(task.task.startsWith('F') ? 'ops/night/fix/<vòng>/' + task.task + '-*.md' : 'ops/night/tasks/' + task.task + '-*.md') + '.',
      '- File có thay đổi: ' + (task.files.map(code).join(', ') || 'không') + '.',
      '- Có thay đổi ngoài báo cáo/tài liệu: ' + (task.codeFiles.length ? 'có' : 'không') + '.',
      ...task.reasons.map(reason => '- Lý do: ' + md(reason) + '.'),
      ...task.flags.map(flag => '- Cờ: ' + md(flag) + '.'),
      ...(task.flags.length ? [] : ['- Cờ: Không.']),
      ...task.matchedRuns.map(run => '- Log đối soát: ' + code(run.path + ':' + run.line) + ', ' + code(run.tag) + ', codex exit ' + (run.exit === null ? 'chưa rõ' : run.exit) + '.'),
      ...(task.matchedRuns.length ? [] : ['- Log đối soát: ' + (task.withRuns ? 'chưa tìm được dòng có SHA tương ứng; chưa xác minh exit code.' : 'không cung cấp --runs; chưa xác minh exit code.')]), '');
  }
  const state = value => 'HEAD=' + code(value.head) + '; nhánh=' + code(value.branch || '(detached HEAD)') + '; git stash list=' + code(value.stash || '(trống)');
  lines.push('Đối chiếu trước/sau: Trước [' + state(before) + ']; Sau [' + state(after) + ']. ' +
    (isDeepStrictEqual(before, after) ? 'Xác nhận HEAD, nhánh và git stash list không đổi.' : 'KHÔNG xác nhận không đổi: trạng thái Git đã đổi trong lúc review; cần chạy lại khi runner dừng.'));
  return lines.join('\n') + '\n';
}

export function main(argv = process.argv.slice(2)) {
  let options, git, before;
  try {
    options = parseArgs(argv);
    git = gitReader(options.repo);
    validate(options, git);
    before = snapshot(git);
  } catch (error) {
    console.error('Không chạy được review: ' + error.message);
    return 2;
  }
  const warnings = [], tasks = [];
  let after = {head: '(không đọc được)', branch: '(không đọc được)', stash: '(không đọc được)'};
  try {
    const runs = readRuns(options.runs, warnings);
    const commits = commitsInRange(git, options.baseSha + '..' + options.branchSha);
    for (const commit of commits) {
      if (!/^night [TF]\d{2}:/.test(commit.subject)) continue;
      try { tasks.push(reviewCommit(git, commit, runs, Boolean(options.runs))); }
      catch {
        const task = commit.subject.match(/^night ([TF]\d{2}):/)[1];
        warnings.push(task + ' ' + commit.sha + ': không đọc đủ diff/báo cáo; cần review thủ công');
        tasks.push({...commit, task, reportPath: 'ops/night/out/reports/' + task + '.md', reportExists: false, status: 'Chưa làm', reasons: ['Chưa đủ dữ liệu để xác minh'], flags: ['Không kiểm được đầy đủ diff/báo cáo'], files: [], codeFiles: [], matchedRuns: [], withRuns: Boolean(options.runs)});
      }
    }
    markReverts(tasks, commits);
  } catch { warnings.push('Không đọc đủ lịch sử Git; cần chạy lại review.'); }
  try { after = snapshot(git); }
  catch { warnings.push('Không chụp được trạng thái Git cuối lượt.'); }
  try { writeFileSync(options.out, render(options, tasks, warnings, before, after), 'utf8'); }
  catch (error) { console.error('--out không ghi được: ' + error.message); return 2; }
  console.log('Đã ghi ' + options.out + ' (' + tasks.length + ' commit task).');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
