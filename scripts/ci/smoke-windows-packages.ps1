$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$releaseDir = Join-Path $root "frontend\release"

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
