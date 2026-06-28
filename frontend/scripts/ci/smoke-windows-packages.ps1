# Runs the smoke windows packages workflow for the developer CLI and automation tooling.

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$releaseDir = Join-Path $root "release"

$installer = Get-ChildItem -Path $releaseDir -Filter "*.exe" |
  Where-Object { $_.Name -match "setup|windieos" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "Missing Windows installer artifact (.exe)."
}

$installDir = Join-Path $env:LOCALAPPDATA "Programs\WindieOS"
$args = @("/S", "/D=$installDir")
$installProc = Start-Process -FilePath $installer.FullName -ArgumentList $args -PassThru -Wait
if ($installProc.ExitCode -ne 0) {
  throw "Installer failed with exit code $($installProc.ExitCode)."
}

$exe = Join-Path $installDir "WindieOS.exe"
if (-not (Test-Path $exe)) {
  throw "Installed executable not found at $exe"
}

$runtimeRoot = Join-Path $installDir "resources\python-runtime"
$runtimePython = Join-Path $runtimeRoot "python.exe"
if (-not (Test-Path $runtimePython)) {
  $runtimePython = Join-Path $runtimeRoot "Scripts\python.exe"
}
if (-not (Test-Path $runtimePython)) {
  throw "Bundled runtime python executable missing under $runtimeRoot"
}

$runtimeVersion = & $runtimePython -V 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Bundled runtime python failed to execute: $runtimeVersion"
}

$runtimePyvenvCfg = Join-Path $runtimeRoot "pyvenv.cfg"
if (Test-Path $runtimePyvenvCfg) {
  $pyvenvContent = Get-Content $runtimePyvenvCfg -Raw
  if ($pyvenvContent -match "hostedtoolcache") {
    throw "Bundled runtime pyvenv.cfg leaked CI host path: $runtimePyvenvCfg"
  }
}

$launchProc = Start-Process -FilePath $exe -ArgumentList "--version" -PassThru
Start-Sleep -Seconds 12
if (-not $launchProc.HasExited) {
  Stop-Process -Id $launchProc.Id -Force
}

if ($env:WINDIE_REQUIRE_SIGNING -eq "true") {
  $signature = Get-AuthenticodeSignature -FilePath $exe
  if ($signature.Status -ne "Valid") {
    throw "Code signing invalid: $($signature.Status)"
  }
}

$uninstaller = Join-Path $installDir "Uninstall WindieOS.exe"
if (Test-Path $uninstaller) {
  Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait
}
