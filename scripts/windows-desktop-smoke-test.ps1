param(
  [string]$AppPath = ""
)

$ErrorActionPreference = 'Stop'
Write-Host 'Jimskay AI Windows desktop smoke test' -ForegroundColor Cyan

if (-not $IsWindows -and $env:OS -ne 'Windows_NT') {
  throw 'Run this script on Windows.'
}

$root = Split-Path -Parent $PSScriptRoot
$checks = @(
  (Join-Path $root 'desktop\main.cjs'),
  (Join-Path $root 'desktop\icon.ico'),
  (Join-Path $root 'desktop\next-server\server.js'),
  (Join-Path $root 'desktop\next-server\package.json')
)
foreach ($path in $checks) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing desktop artifact: $path" }
  Write-Host "PASS artifact: $path"
}

$ps = Get-Command powershell.exe -ErrorAction Stop
Write-Host "PASS PowerShell: $($ps.Source)"

$port = 9002
$process = $null
try {
  if ($AppPath) {
    if (-not (Test-Path -LiteralPath $AppPath)) { throw "App not found: $AppPath" }
    $process = Start-Process -FilePath $AppPath -PassThru
    Write-Host "Started: $AppPath"
  } else {
    Write-Host 'No -AppPath supplied; artifact-only smoke test complete.' -ForegroundColor Yellow
    exit 0
  }

  $ready = $false
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    try {
      $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue
      if ($tcp.TcpTestSucceeded) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) { throw "Jimskay AI did not open local server port $port within 45 seconds." }
  Write-Host "PASS local server: http://127.0.0.1:$port"
  Write-Host 'Desktop startup smoke test passed.' -ForegroundColor Green
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Host 'Stopped test application.'
  }
}
