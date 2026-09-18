param(
    [ValidateRange(1024, 65535)][int]$Port = 4180,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 24 or later, then run this launcher again.'
}
$nodeMajor = & node -p "Number(process.versions.node.split('.')[0])"
if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 24) {
    throw 'Agent Flight Recorder requires Node.js 24 or later.'
}
if (-not (Test-Path -LiteralPath '.\node_modules')) {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Review the npm error above.' }
}
if (-not $SkipBuild -or -not (Test-Path -LiteralPath '.\dist\index.html')) {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed. The server was not started.' }
}
$env:AFR_PORT = [string]$Port
Write-Host "Opening the local recorder server at http://127.0.0.1:$Port"
node .\server\index.mjs
if ($LASTEXITCODE -ne 0) { throw "Recorder exited with code $LASTEXITCODE." }
