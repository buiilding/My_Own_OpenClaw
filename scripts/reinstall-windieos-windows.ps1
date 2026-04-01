$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RootDir "frontend"
$ReleaseDir = Join-Path $FrontendDir "release"
$AppName = if ($env:WINDIE_APP_NAME) { $env:WINDIE_APP_NAME } else { "WindieOS" }
$SidecarLogLevel = if ($env:WINDIE_SIDECAR_LOG_LEVEL) { $env:WINDIE_SIDECAR_LOG_LEVEL } else { "ERROR" }
$FrontendEnvName = if ($env:WINDIE_FRONTEND_ENV) { $env:WINDIE_FRONTEND_ENV } else { "frontend_jarvis" }

function Write-Log {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host "[reinstall-windieos-windows] $Message"
}

function Test-CommandExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-FrontendPythonBuild {
  if ($env:WINDIE_PYTHON_BUILD) {
    return $env:WINDIE_PYTHON_BUILD
  }

  if (Test-CommandExists "conda") {
    try {
      $condaPython = conda run --no-capture-output -n $FrontendEnvName python -c "import sys; print(sys.executable)"
      if ($LASTEXITCODE -eq 0) {
        $resolved = ($condaPython | Select-Object -Last 1).Trim()
        if ($resolved) {
          return $resolved
        }
      }
    } catch {
      Write-Log "conda env '$FrontendEnvName' unavailable; falling back to PATH Python resolution"
    }
  }

  foreach ($candidate in @(
    @("py", "-3.11", "-c", "import sys; print(sys.executable)"),
    @("python", "-c", "import sys; print(sys.executable)")
  )) {
    $commandName = $candidate[0]
    if (-not (Test-CommandExists $commandName)) {
      continue
    }
    try {
      $resolvedPath = & $candidate[0] $candidate[1..($candidate.Length - 1)]
      if ($LASTEXITCODE -eq 0) {
        $resolved = ($resolvedPath | Select-Object -Last 1).Trim()
        if ($resolved) {
          return $resolved
        }
      }
    } catch {
      continue
    }
  }

  throw "Could not resolve a Python 3.11 build interpreter. Set WINDIE_PYTHON_BUILD explicitly."
}

function Get-InstallRoots {
  $roots = @()
  if ($env:LOCALAPPDATA) {
    $roots += (Join-Path $env:LOCALAPPDATA "Programs\$AppName")
  }
  if ($env:ProgramFiles) {
    $roots += (Join-Path $env:ProgramFiles $AppName)
  }
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($programFilesX86) {
    $roots += (Join-Path $programFilesX86 $AppName)
  }
  return $roots | Select-Object -Unique
}

function Get-UninstallerPath {
  foreach ($installRoot in Get-InstallRoots) {
    foreach ($candidate in @(
      (Join-Path $installRoot "Uninstall $AppName.exe"),
      (Join-Path $installRoot "Uninstall.exe")
    )) {
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
  }
  return $null
}

function Get-AppExecutablePath {
  foreach ($installRoot in Get-InstallRoots) {
    if (-not (Test-Path -LiteralPath $installRoot)) {
      continue
    }

    $direct = Join-Path $installRoot "$AppName.exe"
    if (Test-Path -LiteralPath $direct) {
      return $direct
    }

    $nested = Get-ChildItem -Path $installRoot -Filter "$AppName.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
    if ($nested) {
      return $nested
    }
  }
  return $null
}

function Remove-PathIfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue
  )

  if (Test-Path -LiteralPath $PathValue) {
    Remove-Item -LiteralPath $PathValue -Recurse -Force
  }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "This script only supports Windows."
}

if (-not (Test-CommandExists "npm")) {
  throw "npm is required."
}

if (-not (Test-CommandExists "bash")) {
  throw "bash is required because frontend packaging uses scripts/build-sidecar-runtime."
}

$PythonBuild = Get-FrontendPythonBuild
if (-not (Test-Path -LiteralPath $PythonBuild)) {
  throw "Python build interpreter not found: $PythonBuild"
}

Write-Log "repo=$RootDir"
Write-Log "frontend=$FrontendDir"
Write-Log "python_build=$PythonBuild"
Write-Log "sidecar_log_level=$SidecarLogLevel"

Write-Log "stopping running WindieOS processes"
Get-Process -Name $AppName -ErrorAction SilentlyContinue | Stop-Process -Force

$uninstallerPath = Get-UninstallerPath
if ($uninstallerPath) {
  Write-Log "uninstalling previous packaged install via $uninstallerPath"
  $uninstallProcess = Start-Process -FilePath $uninstallerPath -ArgumentList "/S" -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) {
    throw "Uninstall failed with exit code $($uninstallProcess.ExitCode)"
  }
} else {
  Write-Log "no existing uninstaller found; skipping packaged uninstall"
}

foreach ($installRoot in Get-InstallRoots) {
  if (Test-Path -LiteralPath $installRoot) {
    Write-Log "removing leftover install root $installRoot"
    Remove-Item -LiteralPath $installRoot -Recurse -Force
  }
}

$userDataDirs = @(
  (Join-Path $env:APPDATA $AppName),
  (Join-Path $env:LOCALAPPDATA $AppName),
  (Join-Path $env:LOCALAPPDATA "windieos-updater")
) | Select-Object -Unique

Write-Log "removing local app state"
foreach ($userDataDir in $userDataDirs) {
  Remove-PathIfPresent -PathValue $userDataDir
}

Write-Log "cleaning previous build artifacts"
foreach ($artifactPath in @(
  (Join-Path $FrontendDir "dist"),
  (Join-Path $FrontendDir "release"),
  (Join-Path $FrontendDir "python-runtime"),
  (Join-Path $FrontendDir "python-runtime.tar.gz")
)) {
  Remove-PathIfPresent -PathValue $artifactPath
}

Write-Log "building fresh Windows package"
$previousPythonBuild = [Environment]::GetEnvironmentVariable("WINDIE_PYTHON_BUILD", "Process")
$previousSidecarLogLevel = [Environment]::GetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", "Process")
$previousVerboseSidecar = [Environment]::GetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "Process")

[Environment]::SetEnvironmentVariable("WINDIE_PYTHON_BUILD", $PythonBuild, "Process")
[Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $SidecarLogLevel, "Process")
[Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "0", "Process")

try {
  & npm --prefix $FrontendDir run package:win:bundled-python
  if ($LASTEXITCODE -ne 0) {
    throw "Windows packaging failed with exit code $LASTEXITCODE"
  }
} finally {
  [Environment]::SetEnvironmentVariable("WINDIE_PYTHON_BUILD", $previousPythonBuild, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $previousSidecarLogLevel, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", $previousVerboseSidecar, "Process")
}

$setupExe = Get-ChildItem -Path $ReleaseDir -File -Filter "*.exe" -ErrorAction Stop |
  Where-Object { $_.Name -match "Setup" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $setupExe) {
  throw "No Windows installer .exe found under $ReleaseDir"
}

Write-Log "installing $setupExe"
$installProcess = Start-Process -FilePath $setupExe -ArgumentList "/S" -Wait -PassThru
if ($installProcess.ExitCode -ne 0) {
  throw "Installer failed with exit code $($installProcess.ExitCode)"
}

$installedAppPath = Get-AppExecutablePath
if (-not $installedAppPath) {
  throw "Installed app executable not found after install."
}

Write-Log "launching installed packaged app $installedAppPath"
[Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $SidecarLogLevel, "Process")
[Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "0", "Process")
try {
  Start-Process -FilePath $installedAppPath | Out-Null
} finally {
  [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $previousSidecarLogLevel, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", $previousVerboseSidecar, "Process")
}

Write-Log "opening install location"
Start-Process explorer.exe "/select,`"$installedAppPath`"" | Out-Null

Write-Log "done"
