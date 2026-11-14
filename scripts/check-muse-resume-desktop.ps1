$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  & node scripts/check-muse-resume-desktop.mjs
  $uiCode=$LASTEXITCODE
  $checkpoint=Get-Content -LiteralPath outputs/M-20261114-enable-desktop-ui/shutdown.json -Raw | ConvertFrom-Json
  $qaWindow=Get-Process -Id $checkpoint.pid -ErrorAction Stop
  $qaWindow.Refresh()
  $handle=$qaWindow.MainWindowHandle
  if(-not $qaWindow.CloseMainWindow()){throw 'QA window did not accept normal close'}
  if(-not $qaWindow.WaitForExit(15000)){throw 'QA Electron did not exit'}
  if($uiCode -ne 0){throw 'QA UI checks failed'}
  & node scripts/check-muse-resume-desktop.mjs --verify
  if($LASTEXITCODE -ne 0){throw 'QA persistence checks failed'}
}finally{Pop-Location}
