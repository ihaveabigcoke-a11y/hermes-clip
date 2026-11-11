$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS from https://nodejs.org/en/download, then run START-LOCAL.cmd again.' }
& node (Join-Path $PSScriptRoot 'setup-local.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Product Lab Local could not start. Keep this window open and inspect the error above.' }
