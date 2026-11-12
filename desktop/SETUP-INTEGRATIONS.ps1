$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$lock = Get-Content (Join-Path $PSScriptRoot 'integrations-lock.json') -Raw | ConvertFrom-Json
$integrationRoot = Join-Path $PSScriptRoot '.integrations'
New-Item -ItemType Directory -Path $integrationRoot -Force | Out-Null
git --version
if ($LASTEXITCODE -ne 0) { throw 'Install Git for Windows first.' }
python --version
if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12+ on PATH first.' }
$ffmpegVersion = @(ffmpeg -version)
$ffmpegVersion[0]
if ($LASTEXITCODE -ne 0) { throw 'Install FFmpeg on PATH first.' }
$ffprobeVersion = @(ffprobe -version)
$ffprobeVersion[0]
if ($LASTEXITCODE -ne 0) { throw 'Install ffprobe on PATH first.' }
foreach ($entry in @(@{ name = 'Agent-Reach'; spec = $lock.agentReach }, @{ name = 'OpenMontage'; spec = $lock.openMontage }, @{ name = 'rea-video'; spec = $lock.reaVideo })) {
    $repoPath = Join-Path $integrationRoot $entry.name
    if (!(Test-Path $repoPath)) {
        git clone --no-checkout --filter=blob:none $entry.spec.repository $repoPath
        if ($LASTEXITCODE -ne 0) { throw 'Could not download the source repository.' }
        git -C $repoPath checkout --detach $entry.spec.commit
        if ($LASTEXITCODE -ne 0) { throw 'Could not select the tested revision.' }
    }
    $head = git -C $repoPath rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head.Trim() -ne $entry.spec.commit) { throw "Existing $($entry.name) has a different revision. Keep it; select a clean integration folder before retrying." }
    $changes = git -C $repoPath status --porcelain --untracked-files=no
    if ($changes) { throw "Existing $($entry.name) has local changes. Preserve them before setup." }
}
$venv = Join-Path $integrationRoot '.venv'
if (!(Test-Path $venv)) {
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
}
$pythonPath = Join-Path $venv 'Scripts/python.exe'
$reachSource = Join-Path $integrationRoot 'Agent-Reach'
& $pythonPath -m pip install $reachSource -r (Join-Path $PSScriptRoot 'integrations-requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install local integration dependencies.' }
$config = @{ python = $pythonPath; reach = (Join-Path $venv 'Scripts/agent-reach.exe'); montage = (Join-Path $integrationRoot 'OpenMontage') }
python -c "import sys; assert (3,10) <= sys.version_info[:2] <= (3,14), 'rea-video requires Python 3.10-3.14'"
if ($LASTEXITCODE -ne 0) { throw 'Select Python 3.10-3.14 before installing rea-video.' }
$reaVenv = Join-Path $integrationRoot '.rea-venv'
if (!(Test-Path $reaVenv)) {
    python -m venv $reaVenv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the rea-video environment.' }
}
$reaPython = Join-Path $reaVenv 'Scripts/python.exe'
Push-Location (Join-Path $integrationRoot 'rea-video')
try {
    & $reaPython -m pip install '.[ocr]'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install pinned rea-video with OCR.' }
} finally { Pop-Location }
$config.reaPython = $reaPython
$config.reaVideo = Join-Path $integrationRoot 'rea-video'
$config | ConvertTo-Json | Set-Content (Join-Path $integrationRoot 'config.json') -Encoding utf8
Write-Host 'Installed pinned tools. Open Product Lab Desktop > Nghien cuu & dung > Kiem tra cong cu.'
Write-Host 'No accounts were signed in, no model API was called, and no social content was posted.'

