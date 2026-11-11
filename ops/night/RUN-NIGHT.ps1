<#
  Hermes Clip - night runner ("boss" for Codex).
  Runs the task files in .\tasks one by one with `codex exec`, then gates each
  result with the repo's own checks, commits good work on a night-* branch,
  stashes failed work, and writes a morning report.

  ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI.

  Safety: works in a SEPARATE clone (default C:\HermesNight\hermes-clip).
  Never touches the installed app, AppData, Muse/Instagram sessions.
  Never pushes. Never deletes work (failed attempts go to `git stash`).
#>
param(
  [string]$Repo = "C:\HermesNight\hermes-clip",
  [string]$RepoUrl = "https://github.com/ihaveabigcoke-a11y/hermes-clip.git",
  [string]$Branch = "night-20261111",
  [int]$TaskTimeoutMin = 120,
  [int]$CheckTimeoutMin = 30,
  [string]$CodexArgs = "--sandbox danger-full-access",
  [string]$CodexModel = "",
  [switch]$NoLastMessageFlag,
  [switch]$SkipInstall,
  [switch]$PreflightOnly,
  [string]$OnlyTasks = "",
  [string]$FfmpegBin = "C:\Users\ADMIN\Downloads\Product-Lab-Local\Product-Lab-Local\desktop\tools\ffmpeg\bin",
  [string]$TaskFolder = "",
  [string]$FixLabel = "fix"
)

$ErrorActionPreference = "Stop"
$Pack = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$RunDir = Join-Path $Pack ("runs\" + $Branch + "-" + (Get-Date -Format "HHmmss"))
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
$script:RunLog = Join-Path $RunDir "runner.log"

# ---------------------------------------------------------------- tasks
# Order = priority. Deps = tasks that must be DONE/NOCHANGE first.
$Tasks = @(
  @{ Id = "T01"; File = "T01-tien-te-CNY.md";                       Title = "Research: CNY + tien te tung con so";            Deps = @() },
  @{ Id = "T02"; File = "T02-research-truong-quyet-dinh.md";        Title = "Research: truong quyet dinh + brief + co";       Deps = @("T01") },
  @{ Id = "T11"; File = "T11-agent-reach-kiem-listing-va-tin-hieu.md"; Title = "Agent Reach: kiem listing + tin hieu canh tranh"; Deps = @("T02") },
  @{ Id = "T03"; File = "T03-sua-stage-san-pham.md";                Title = "Sua buoc tien do san pham";                     Deps = @() },
  @{ Id = "T05"; File = "T05-thu-vien-cong-thuc.md";                Title = "Thu vien cong thuc viral";                      Deps = @() },
  @{ Id = "T13"; File = "T13-sua-T01-promote-tien-te.md";           Title = "Sua T01: promote + form tien te";               Deps = @("T01") },
  @{ Id = "T14"; File = "T14-sua-T11-trang-thai-heuristic.md";      Title = "Sua T11: trang thai + heuristic";               Deps = @("T11") },
  @{ Id = "T06"; File = "T06-mau-kich-ban-theo-cong-thuc.md";       Title = "Mau kich ban theo cong thuc";                   Deps = @("T05") },
  @{ Id = "T12"; File = "T12-agent-reach-nap-video-mau-vao-cong-thuc.md"; Title = "Nap video mau vao thu vien cong thuc";  Deps = @("T05") },
  @{ Id = "T04"; File = "T04-giao-dien-nghien-cuu.md";              Title = "Giao dien Nghien cuu";                          Deps = @("T01","T02") },
  @{ Id = "T07"; File = "T07-instagram-tong-quan.md";               Title = "Instagram tong quan theo tai khoan";             Deps = @() },
  @{ Id = "T08"; File = "T08-sua-ui-nho.md";                        Title = "Sua UI nho";                                    Deps = @() },
  @{ Id = "T09"; File = "T09-nhan-AI-instagram-khao-sat.md";        Title = "Nhan AI Instagram (fixture only)";              Deps = @() },
  @{ Id = "T10"; File = "T10-tai-lieu-va-tong-ket.md";              Title = "Tai lieu + tong ket";                           Deps = @() },
  # ---- dem 3
  @{ Id = "T19"; File = "T19-thong-nhat-harness-test-desktop.md";   Title = "Thong nhat harness test desktop";               Deps = @() },
  @{ Id = "T23"; File = "T23-hermes-tu-kiem-san-pham.md";           Title = "Hermes tu kiem san pham";                       Deps = @("T04","T14") },
  @{ Id = "T21"; File = "T21-hermes-tu-phan-tich-video-mau.md";     Title = "Hermes tu phan tich video mau";                 Deps = @("T12") },
  @{ Id = "T22"; File = "T22-muse-dinh-kem-anh-phan-tich-video.md"; Title = "Muse dinh kem anh phan tich video";             Deps = @("T21") },
  @{ Id = "T24"; File = "T24-tu-review-dem.md";                     Title = "Tu review dem bang script";                     Deps = @() },
  @{ Id = "T26"; File = "T26-don-ghi-chu-review-1.md";              Title = "Don ghi chu review 1";                          Deps = @() },
  @{ Id = "T27"; File = "T27-don-ghi-chu-review-2.md";              Title = "Don ghi chu review 2";                          Deps = @() },
  @{ Id = "T15"; File = "T15-trang-san-pham-buoc-tiep-va-kiem-mau.md"; Title = "San pham: buoc tiep theo + kiem mau";        Deps = @("T03") },
  @{ Id = "T16"; File = "T16-dem-comment-tu-khoa.md";               Title = "Dem comment tu khoa CTA";                       Deps = @() },
  @{ Id = "T17"; File = "T17-link-utm-theo-tai-khoan-hook.md";      Title = "Link UTM theo tai khoan x hook";                Deps = @() },
  @{ Id = "T18"; File = "T18-instagram-api-chinh-thuc-khao-sat-va-adapter.md"; Title = "Instagram API adapter (tat mac dinh)"; Deps = @() },
  @{ Id = "T20"; File = "T20-tong-ket-dem-3.md";                    Title = "Tong ket dem 3 + skills vao AGENTS";            Deps = @() }
)

if ($TaskFolder) {
  # Fix tasks written by the Claude Code boss: Fxx-ascii-slug.md, run in name order, no deps.
  $Tasks = @()
  foreach ($f in @(Get-ChildItem -Path $TaskFolder -Filter "F*.md" | Sort-Object Name)) {
    if ($f.Name -match '^(F\d\d)-([A-Za-z0-9-]+)\.md$') {
      $Tasks += @{ Id = $Matches[1]; File = $f.FullName; Title = ("Fix " + ($Matches[2] -replace '-', ' ')); Deps = @() }
    }
  }
}

$Checks = @(
  @{ Name = "unit";    Cmd = "npm test" },
  @{ Name = "types";   Cmd = "npm run typecheck" },
  @{ Name = "api";     Cmd = "npm run test:api" },
  @{ Name = "desktop"; Cmd = "npm run test:desktop" },
  @{ Name = "build";   Cmd = "npm run local:build" }
)

$ForbiddenPatterns = @(
  '^data/', '^evidence/', '^ops/night/tasks/', '^ops/night/input/', '^ops/night/COMMON\.md$',
  '^ops/night/RUN-NIGHT\.ps1$', '^desktop/local-dist/', '^pnpm-lock\.yaml$', '^desktop/package-lock\.json$',
  '^\.github/', '^\.claude/', '^ops/night/fix/'
)

# ---------------------------------------------------------------- helpers
function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  [IO.File]::AppendAllText($script:RunLog, $line + "`r`n", $Utf8)
}

function Exec-Cmd([string]$cmdline, [string]$cwd, [string]$logFile, [int]$timeoutMin) {
  $ErrorActionPreference = "Continue"
  # Runs through cmd.exe so npm/pnpm/codex .cmd shims work. Returns exit code, -999 on timeout.
  $inner = $cmdline + ' > "' + $logFile + '" 2>&1'
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList ('/d /s /c "' + $inner + '"') -WorkingDirectory $cwd -PassThru -WindowStyle Hidden
  $null = $p.Handle  # needed so ExitCode is available later
  if (-not $p.WaitForExit($timeoutMin * 60 * 1000)) {
    & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null
    return -999
  }
  return $p.ExitCode
}

function Invoke-Git([string[]]$gitArgs) {
  $ErrorActionPreference = "Continue"  # PS 5.1: stderr of native tools must not become terminating errors
  $out = & git -C $Repo @gitArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("git " + ($gitArgs -join " ") + " failed: " + ($out | Out-String)) }
  return $out
}

function Tail([string]$path, [int]$n) {
  if (Test-Path $path) { return ((Get-Content $path -Tail $n -Encoding UTF8) -join "`n") }
  return "(no log)"
}

function Changed-Files {
  $lines = & git -C $Repo status --porcelain=v1 --untracked-files=all
  $files = @()
  foreach ($l in $lines) {
    if ($l.Length -lt 4) { continue }
    $p = $l.Substring(3)
    if ($p -match ' -> ') { $p = ($p -split ' -> ')[1] }
    $files += $p.Trim('"')
  }
  return $files
}

function Deps-Changed {
  $ErrorActionPreference = "Continue"
  $bad = @()
  foreach ($pj in @("package.json", "desktop/package.json")) {
    $full = Join-Path $Repo $pj
    if (-not (Test-Path $full)) { continue }
    $headText = (& git -C $Repo show ("HEAD:" + $pj) 2>$null) -join "`n"
    if (-not $headText) { continue }
    $old = $headText | ConvertFrom-Json
    $new = (Get-Content $full -Raw -Encoding UTF8) | ConvertFrom-Json
    foreach ($k in @("dependencies", "devDependencies", "optionalDependencies")) {
      $a = ($old.$k | ConvertTo-Json -Compress -Depth 5)
      $b = ($new.$k | ConvertTo-Json -Compress -Depth 5)
      if ($a -ne $b) { $bad += ($pj + " " + $k) }
    }
  }
  return $bad
}

function Run-Checks([string]$tag) {
  $res = @{}
  foreach ($c in $Checks) {
    $log = Join-Path $RunDir ("check-" + $tag + "-" + $c.Name + ".log")
    $code = Exec-Cmd $c.Cmd $Repo $log $CheckTimeoutMin
    $res[$c.Name] = $code
    Log ("    check " + $c.Name + ": exit " + $code)
  }
  return $res
}

function Test-AuthError([string]$logPath) {
  if (-not (Test-Path $logPath)) { return $false }
  $txt = Get-Content $logPath -Raw -Encoding UTF8
  return ($txt -match '(?i)unexpected status (401|403)' -or $txt -match '(?i)\b401 Unauthorized\b' -or $txt -match '(?i)not logged in')
}

function Read-Report([string]$path, [string]$id) {
  # Valid report = Codex's own final message containing the report block for THIS task.
  $res = @{ Ok = $false; Status = "" }
  if (-not (Test-Path $path)) { return $res }
  $txt = Get-Content $path -Raw -Encoding UTF8
  if ($txt -match ('(?i)===\s*B\S*O C\S*O\s+' + $id + '\b')) {
    if ($txt -match '(?im)^\s*TR\S*NG TH\S*I\s*:\s*(done|partial|blocked)') { $res.Ok = $true; $res.Status = $Matches[1].ToLower() }
  }
  return $res
}

function Run-Codex([string]$promptText, [string]$tag, [string]$reportPath) {
  $promptFile = Join-Path $RunDir ($tag + "-prompt.md")
  [IO.File]::WriteAllText($promptFile, $promptText, $Utf8)
  $log = Join-Path $RunDir ($tag + "-codex.log")
  if (Test-Path $reportPath) { Remove-Item $reportPath -Force }
  $cmd = "codex exec " + $CodexArgs
  if ($CodexModel) { $cmd += " -m " + $CodexModel }
  if (-not $NoLastMessageFlag) { $cmd += ' --output-last-message "' + $reportPath + '"' }
  $cmd += ' - < "' + $promptFile + '"'
  Log ("    codex start (" + $tag + ")")
  $code = Exec-Cmd $cmd $Repo $log $TaskTimeoutMin
  Log ("    codex exit " + $code)
  if ($NoLastMessageFlag -or -not (Test-Path $reportPath)) {
    # keep the log tail OUTSIDE the repo; a missing report must stay missing
    [IO.File]::WriteAllText((Join-Path $RunDir ($tag + "-tail.md")), (Tail $log 80), $Utf8)
  }
  $auth = ($code -ne 0) -and (Test-AuthError $log)
  return @{ Code = $code; Log = $log; Auth = $auth }
}

function Gate([hashtable]$baseline, [string]$tag) {
  $reasons = @()
  $files = @(Changed-Files)
  $reportsRel = "ops/night/out/"
  $real = @($files | Where-Object { -not $_.StartsWith($reportsRel) })
  foreach ($f in $files) {
    foreach ($pat in $ForbiddenPatterns) { if ($f -match $pat) { $reasons += ("forbidden path changed: " + $f) } }
  }
  foreach ($d in (Deps-Changed)) { $reasons += ("dependencies changed: " + $d) }
  $checkRes = Run-Checks $tag
  $logs = @()
  foreach ($c in $Checks) {
    $n = $c.Name
    if ($baseline[$n] -eq 0 -and $checkRes[$n] -ne 0) {
      $reasons += ("regression: " + $c.Cmd + " now exits " + $checkRes[$n])
      $logs += ("### " + $c.Cmd + "`n" + (Tail (Join-Path $RunDir ("check-" + $tag + "-" + $n + ".log")) 80))
    }
  }
  return @{ Ok = ($reasons.Count -eq 0); NoChange = ($real.Count -eq 0); Reasons = $reasons; FailLogs = ($logs -join "`n`n"); Files = $real; Checks = $checkRes }
}

# ---------------------------------------------------------------- keep PC awake while running
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$script:FfmpegNote = ""
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  if ($FfmpegBin -and (Test-Path (Join-Path $FfmpegBin "ffmpeg.exe"))) { $env:Path = $FfmpegBin + ";" + $env:Path }
  else { $script:FfmpegNote = "WARNING: ffmpeg not on PATH and not found in " + $FfmpegBin + " - tests that need ffmpeg may fail at baseline" }
}
$script:PreStash = ""
try { Add-Type -Namespace HermesNight -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' } catch { }
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED = 0x80000001 : keep the PC from sleeping while this window runs
[HermesNight.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null

try {
  Log ("Run dir: " + $RunDir)

  # ------------------------------------------------------------ preflight
  foreach ($tool in @("git", "node", "npm", "codex")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw ("Missing tool on PATH: " + $tool + ". See README-DEM3.md.") }
  }
  $nodeMajor = [int](((& node -v) -replace '^v', '') -split '\.')[0]
  if ($nodeMajor -lt 22) { throw ("Node >= 22 required, found " + (& node -v)) }
  $pnpm = "pnpm"
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { $pnpm = "corepack pnpm" }

  if (-not (Test-Path (Join-Path $Repo ".git"))) {
    Log ("Cloning " + $RepoUrl + " -> " + $Repo)
    New-Item -ItemType Directory -Force -Path (Split-Path $Repo -Parent) | Out-Null
    $ErrorActionPreference = "Continue"
    & git clone $RepoUrl $Repo
    $cloneCode = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($cloneCode -ne 0) { throw "git clone failed" }
  }
  if ($script:FfmpegNote) { Log $script:FfmpegNote }
  if ((& git -C $Repo status --porcelain).Count -gt 0) {
    # Never delete work: park uncommitted changes in a named stash and continue.
    $script:PreStash = "night-PRESTASH-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $ErrorActionPreference = "Continue"
    & git -C $Repo stash push -u -m $script:PreStash *> $null
    $ErrorActionPreference = "Stop"
    if ((& git -C $Repo status --porcelain).Count -gt 0) { throw ("Repo has uncommitted changes that could not be stashed: " + $Repo) }
    Log ("Repo had uncommitted changes -> saved in git stash '" + $script:PreStash + "' (nothing deleted)")
  }
  Invoke-Git @("fetch", "origin") | Out-Null
  $ErrorActionPreference = "Continue"
  & git -C $Repo rev-parse --verify --quiet $Branch *> $null
  $branchExists = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = "Stop"
  if ($branchExists) { Log ("Resuming existing branch " + $Branch); Invoke-Git @("checkout", $Branch) | Out-Null }
  else { Log ("Creating branch " + $Branch + " from origin/main"); Invoke-Git @("checkout", "-b", $Branch, "origin/main") | Out-Null }
  Invoke-Git @("config", "user.name", "Hermes Night Runner") | Out-Null
  Invoke-Git @("config", "user.email", "night-runner@localhost") | Out-Null

  # copy the task pack into the repo so Codex can read inputs; commit once
  $dest = Join-Path $Repo "ops\night"
  New-Item -ItemType Directory -Force -Path (Join-Path $dest "out\reports") | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Pack "tasks") $dest
  Copy-Item -Recurse -Force (Join-Path $Pack "input") $dest
  Copy-Item -Force (Join-Path $Pack "COMMON.md") $dest
  Copy-Item -Force (Join-Path $Pack "RUN-NIGHT.ps1") $dest
  if ($TaskFolder) {
    $fixDest = Join-Path $dest ("fix\" + $FixLabel)
    New-Item -ItemType Directory -Force -Path $fixDest | Out-Null
    Copy-Item -Force (Join-Path $TaskFolder "F*.md") $fixDest
  }
  if (Test-Path (Join-Path $Pack "skills")) {
    # project skills for Claude Code / Codex: <repo>\.claude\skills\<name>\SKILL.md
    New-Item -ItemType Directory -Force -Path (Join-Path $Repo ".claude") | Out-Null
    Copy-Item -Recurse -Force (Join-Path $Pack "skills") (Join-Path $Repo ".claude")
  }
  if ((& git -C $Repo status --porcelain).Count -gt 0) {
    Invoke-Git @("add", "-A") | Out-Null
    $packMsg = "night: add task pack"
    if ($TaskFolder) { $packMsg = "night: add fix pack " + $FixLabel }
    Invoke-Git @("commit", "-m", $packMsg) | Out-Null
    Log "Committed task pack"
  }

  if (-not $SkipInstall) {
    Log "Installing root deps (pnpm install --frozen-lockfile)"
    $c = Exec-Cmd ($pnpm + " install --frozen-lockfile") $Repo (Join-Path $RunDir "install-root.log") 30
    if ($c -ne 0) { throw ("Root install failed, see " + (Join-Path $RunDir "install-root.log")) }
    Log "Installing desktop deps (npm ci)"
    $c = Exec-Cmd "npm ci" (Join-Path $Repo "desktop") (Join-Path $RunDir "install-desktop.log") 30
    if ($c -ne 0) { Log ("WARNING: desktop npm ci failed, desktop checks may fail at baseline. Log: " + (Join-Path $RunDir "install-desktop.log")) }
  }

  # codex smoke test: can it run non-interactively and write inside the repo?
  Log "Codex smoke test"
  $smokeReport = Join-Path $RunDir "smoke-report.md"
  $smokeFile = Join-Path $Repo "ops\night\out\smoke.txt"
  $r = Run-Codex "Create the file ops/night/out/smoke.txt containing exactly READY. Do not change any other file. Do not commit. Then reply READY." "smoke" $smokeReport
  if ($r.Auth) { throw ("Codex AUTH ERROR (401/403): key het han hoac chua dang nhap. Gia han key / codex login roi chay lai. Log: " + $r.Log) }
  if ($r.Code -ne 0 -or -not (Test-Path $smokeFile)) {
    throw ("Codex smoke test failed (exit " + $r.Code + "). Read " + $r.Log + " and README-DEM3.md.")
  }
  Remove-Item $smokeFile -Force
  Log "Codex smoke test OK"

  Log "Baseline checks"
  $baseline = Run-Checks "baseline"
  $okCount = @($baseline.Values | Where-Object { $_ -eq 0 }).Count
  if ($okCount -eq 0) { throw "All baseline checks fail - environment is broken, stopping before any change." }
  if ($PreflightOnly) { Log "PreflightOnly: stop here. Everything is ready."; return }

  # ------------------------------------------------------------ task loop
  # Done = a "night Txx: ..." commit that is not "report only" and not reverted later.
  $already = @{}
  foreach ($s in @(& git -C $Repo log --reverse --format=%s ("origin/main.." + $Branch))) {
    if ($s -match '^Revert "night ([TF]\d\d):') { $already.Remove($Matches[1]); continue }
    if ($s -match '^night ([TF]\d\d): ') {
      $tid = $Matches[1]
      if ($s -match 'report only\s*$') { continue }
      $already[$tid] = $true
    }
  }
  $only = @()
  if ($OnlyTasks) { $only = $OnlyTasks.Split(",") | ForEach-Object { $_.Trim() } }
  $status = [ordered]@{}
  $rows = @()
  $authDead = $false
  $common = Get-Content (Join-Path $Pack "COMMON.md") -Raw -Encoding UTF8
  $okStates = @("DONE", "NOCHANGE", "PARTIAL")

  foreach ($t in $Tasks) {
    $id = $t.Id
    $start = Get-Date
    if ($only.Count -gt 0 -and -not ($only -contains $id)) { $status[$id] = "NOT-SELECTED"; continue }
    if ($already[$id]) { $status[$id] = "DONE"; Log ($id + " already committed earlier, skip"); continue }
    if ($authDead) {
      $status[$id] = "NOT-RUN"
      $rows += ("| " + $id + " | " + $t.Title + " | NOT-RUN (Codex auth loi) | - | - |")
      continue
    }
    $blocked = @($t.Deps | Where-Object { -not (($okStates -contains $status[$_]) -or $already[$_]) })
    if ($blocked.Count -gt 0) {
      $status[$id] = "SKIPPED"
      $rows += ("| " + $id + " | " + $t.Title + " | SKIPPED (thieu " + ($blocked -join ",") + ") | - | - |")
      Log ($id + " skipped, deps not done: " + ($blocked -join ","))
      continue
    }

    Log ("==== " + $id + " " + $t.Title)
    $taskPath = Join-Path $Pack ("tasks\" + $t.File)
    if ([IO.Path]::IsPathRooted($t.File)) { $taskPath = $t.File }
    $task = Get-Content $taskPath -Raw -Encoding UTF8
    $prompt = $common + "`n`n---`n`n" + $task + "`n`n---`nTASK-ID: " + $id + ". Ket thuc bang bao cao theo mau trong quy tac chung, dong dau la === BAO CAO " + $id + " ===`n"

    $final = $null
    $finalReport = $null
    for ($attempt = 1; $attempt -le 2; $attempt++) {
      $tag = $id + "-a" + $attempt
      $attemptReport = Join-Path $Repo ("ops\night\out\reports\" + $id + "-a" + $attempt + ".md")
      $r = Run-Codex $prompt $tag $attemptReport
      if ($r.Auth) {
        $authDead = $true
        Log "    CODEX AUTH ERROR (401/403) - stopping all remaining tasks"
        $final = @{ Ok = $false; NoChange = $false; Reasons = @("codex auth error 401/403 - gia han key"); FailLogs = ""; Files = @(); Checks = @{} }
        break
      }
      $rep = Read-Report $attemptReport $id
      $g = Gate $baseline $tag
      if ($r.Code -eq -999) { $g.Ok = $false; $g.Reasons += ("codex timeout after " + $TaskTimeoutMin + " min") }
      elseif ($r.Code -ne 0) { $g.Ok = $false; $g.Reasons += ("codex exit " + $r.Code) }
      if (-not $rep.Ok) { $g.Ok = $false; $g.Reasons += ("missing/invalid report block '=== BAO CAO " + $id + " ===' + 'TRANG THAI:'") }
      if ($g.Ok) { $final = $g; $final.ReportStatus = $rep.Status; $finalReport = $attemptReport; break }
      Log ("    attempt " + $attempt + " failed: " + ($g.Reasons -join "; "))
      if ($attempt -eq 1) {
        $prompt = $common + "`n`n---`n`n" + $task + "`n`n---`nTASK-ID: " + $id + "`n`n## LAN CHAY TRUOC KHONG QUA KIEM TRA`nLy do:`n- " + ($g.Reasons -join "`n- ") + "`n`nLog loi:`n" + $g.FailLogs + "`n`nSua dung cac loi tren (giu phan da lam dung). Khong lam them viec ngoai task. Ket thuc bang bao cao, dong dau la === BAO CAO " + $id + " ===`n"
      } else {
        $final = $g
      }
    }

    $mins = [int]((Get-Date) - $start).TotalMinutes
    if ($final.Ok) {
      Copy-Item -Force $finalReport (Join-Path $Repo ("ops\night\out\reports\" + $id + ".md"))
      if ($final.NoChange) {
        $status[$id] = "NOCHANGE"
        if ((& git -C $Repo status --porcelain).Count -gt 0) { Invoke-Git @("add", "-A") | Out-Null; Invoke-Git @("commit", "-m", ("night " + $id + ": no code change")) | Out-Null }
        $rows += ("| " + $id + " | " + $t.Title + " | NOCHANGE (" + $final.ReportStatus + ") | " + $mins + " | reports/" + $id + ".md |")
        Log ($id + " finished with no code change")
      } else {
        Invoke-Git @("add", "-A") | Out-Null
        Invoke-Git @("commit", "-m", ("night " + $id + ": " + $t.Title)) | Out-Null
        $sha = (Invoke-Git @("rev-parse", "--short", "HEAD")) | Select-Object -First 1
        if ($final.ReportStatus -eq "done") { $status[$id] = "DONE" } else { $status[$id] = "PARTIAL" }
        $rows += ("| " + $id + " | " + $t.Title + " | " + $status[$id] + " " + $sha + " (" + $final.Files.Count + " file) | " + $mins + " | reports/" + $id + ".md |")
        Log ($id + " " + $status[$id] + " " + $sha)
      }
    } else {
      $ErrorActionPreference = "Continue"
      & git -C $Repo stash push -u -m ("night-FAILED-" + $id) *> $null
      $ErrorActionPreference = "Stop"
      if ($authDead) { $status[$id] = "FAILED-AUTH" } else { $status[$id] = "FAILED" }
      $rows += ("| " + $id + " | " + $t.Title + " | " + $status[$id] + " (stash: night-FAILED-" + $id + ") | " + $mins + " | " + ($final.Reasons -join "; ") + " |")
      Log ($id + " " + $status[$id] + ", work kept in git stash")
    }
  }

  # ------------------------------------------------------------ auto review (T24 script, read-only)
  $autoReview = ""
  if (Test-Path (Join-Path $Repo "scripts\night-review.mjs")) {
    $arLog = Join-Path $RunDir "auto-review.log"
    $arCode = Exec-Cmd ('node scripts/night-review.mjs --base origin/main --out ops/night/out/AUTO-REVIEW.md --runs "' + (Join-Path $Pack "runs") + '"') $Repo $arLog 10
    Log ("Auto review: exit " + $arCode)
    if ($arCode -eq 0) { $autoReview = "Tu review may moc: ops/night/out/AUTO-REVIEW.md (van can review noi dung truoc khi ap vao app chinh)" }
    else { $autoReview = "Tu review may moc loi (exit " + $arCode + "), xem " + $arLog }
  }

  # ------------------------------------------------------------ morning report
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("# Bao cao dem " + $Branch)
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("Ket thuc: " + (Get-Date -Format "yyyy-MM-dd HH:mm") + ". Nhanh: " + $Branch + ". Chua push.")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("Baseline: " + (($Checks | ForEach-Object { $_.Name + "=" + $baseline[$_.Name] }) -join ", ") + " (0 = qua)")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("| Task | Noi dung | Trang thai | Phut | Bao cao / ly do |")
  [void]$sb.AppendLine("|---|---|---|---|---|")
  foreach ($row in $rows) { [void]$sb.AppendLine($row) }
  [void]$sb.AppendLine("")
  if ($authDead) { [void]$sb.AppendLine("**CODEX AUTH ERROR (401/403): key het han giua dem. Gia han key roi chay lai START-NIGHT3.cmd; task DONE se tu bo qua.**"); [void]$sb.AppendLine("") }
  if ($script:PreStash) { [void]$sb.AppendLine("Truoc khi chay, repo co thay doi chua commit: da cat vao git stash '" + $script:PreStash + "' (khong xoa gi)."); [void]$sb.AppendLine("") }
  if ($autoReview) { [void]$sb.AppendLine($autoReview); [void]$sb.AppendLine("") }
  [void]$sb.AppendLine("Log chi tiet (ngoai repo): " + $RunDir)
  [void]$sb.AppendLine("Task FAILED: xem bang lenh ``git stash list`` trong " + $Repo + ".")
  $reportText = $sb.ToString()
  [IO.File]::WriteAllText((Join-Path $Repo "ops\night\out\REPORT.md"), $reportText, $Utf8)
  [IO.File]::WriteAllText((Join-Path $RunDir "REPORT.md"), $reportText, $Utf8)
  if ((& git -C $Repo status --porcelain).Count -gt 0) { Invoke-Git @("add", "-A") | Out-Null; Invoke-Git @("commit", "-m", "night: morning report") | Out-Null }
  Log "ALL DONE. Report: ops\night\out\REPORT.md"
}
catch {
  Log ("STOPPED: " + $_.Exception.Message)
  exit 1
}
finally {
  [HermesNight.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null
}
