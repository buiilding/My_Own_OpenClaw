# Runs the reinstall windieos windows workflow for the developer CLI and automation tooling.

param(
  [switch]$SkipDataReset,
  [switch]$SkipLaunch
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RootDir "frontend"
$ReleaseDir = Join-Path $FrontendDir "release"
$WinUnpackedDir = Join-Path $ReleaseDir "win-unpacked"
$AppName = if ($env:WINDIE_APP_NAME) { $env:WINDIE_APP_NAME } else { "WindieOS" }
$SidecarLogLevel = if ($env:WINDIE_SIDECAR_LOG_LEVEL) { $env:WINDIE_SIDECAR_LOG_LEVEL } else { "ERROR" }
$FrontendEnvName = if ($env:WINDIE_FRONTEND_ENV) { $env:WINDIE_FRONTEND_ENV } else { "frontend_jarvis" }
$UserDataCacheExclusions = @(
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GPUCache",
  "Code Cache",
  "GrShaderCache"
)

function Write-Log {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host "[reinstall-windieos-windows] $Message"
}

function Write-WarningLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Warning "[reinstall-windieos-windows] $Message"
}

function Test-CommandExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-GitBashCandidates {
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  $candidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files\Git\usr\bin\bash.exe"
  )
  if ($env:ProgramFiles) {
    $candidates += @(
      (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
      (Join-Path $env:ProgramFiles "Git\usr\bin\bash.exe")
    )
  }
  if ($programFilesX86) {
    $candidates += @(
      (Join-Path $programFilesX86 "Git\bin\bash.exe"),
      (Join-Path $programFilesX86 "Git\usr\bin\bash.exe")
    )
  }
  return $candidates | Select-Object -Unique
}

function Ensure-BashAvailable {
  $existing = Get-Command bash -ErrorAction SilentlyContinue
  if ($existing) {
    return $existing.Source
  }

  foreach ($candidate in Get-GitBashCandidates) {
    if (-not (Test-Path -LiteralPath $candidate)) {
      continue
    }
    $bashDir = Split-Path -Parent $candidate
    $env:PATH = "$bashDir;$env:PATH"
    Write-Log "added Git Bash to PATH from $bashDir"
    return $candidate
  }

  throw "bash is required because frontend packaging uses scripts/build-sidecar-runtime.sh."
}

function Test-DeveloperModeEnabled {
  try {
    $value = Get-ItemPropertyValue `
      -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" `
      -Name "AllowDevelopmentWithoutDevLicense" `
      -ErrorAction Stop
    return $value -eq 1
  } catch {
    return $false
  }
}

function Test-SymlinkCapability {
  $probeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("windieos-symlink-probe-" + [guid]::NewGuid().ToString("N"))
  $targetPath = Join-Path $probeRoot "target.txt"
  $linkPath = Join-Path $probeRoot "link.txt"

  try {
    New-Item -ItemType Directory -Path $probeRoot -Force | Out-Null
    Set-Content -LiteralPath $targetPath -Value "probe" -Encoding ascii
    New-Item -ItemType SymbolicLink -Path $linkPath -Target $targetPath -ErrorAction Stop | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    if (Test-Path -LiteralPath $probeRoot) {
      Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-WindowsPackagingPreflight {
  $developerMode = Test-DeveloperModeEnabled
  $canCreateSymlink = Test-SymlinkCapability

  if ($developerMode) {
    Write-Log "Developer Mode is enabled"
  } else {
    Write-WarningLog "Developer Mode does not appear to be enabled; electron-builder may fail when unpacking code-sign helpers."
  }

  if ($canCreateSymlink) {
    Write-Log "symlink creation probe succeeded"
  } elseif ($developerMode) {
    Write-Log "symlink creation probe failed in PowerShell, but Developer Mode is enabled; continuing"
  } else {
    Write-WarningLog "symlink creation probe failed; run elevated or enable Developer Mode before packaging if electron-builder hits winCodeSign extraction errors."
  }
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

function Get-WindieProcessCandidates {
  $installRoots = Get-InstallRoots
  $normalizedRoots = @($WinUnpackedDir) + $installRoots

  $candidates = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $executablePath = $_.ExecutablePath
    $commandLine = $_.CommandLine
    if ($_.Name -eq "$AppName.exe") {
      return $true
    }
    foreach ($root in $normalizedRoots) {
      if (-not $root) {
        continue
      }
      if ($executablePath -and $executablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
      if ($commandLine -and $commandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
      }
    }
    return $false
  })

  return $candidates
}

function Stop-WindieProcesses {
  $candidates = Get-WindieProcessCandidates | Select-Object -Property Name, ProcessId, ExecutablePath -Unique
  if (-not $candidates -or $candidates.Count -eq 0) {
    Write-Log "no running WindieOS processes detected"
    return
  }

  foreach ($candidate in $candidates) {
    Write-Log "stopping process id=$($candidate.ProcessId) name=$($candidate.Name) path=$($candidate.ExecutablePath)"
    Stop-Process -Id $candidate.ProcessId -Force -ErrorAction SilentlyContinue
  }

  for ($attempt = 1; $attempt -le 10; $attempt++) {
    $remaining = Get-WindieProcessCandidates | Select-Object -ExpandProperty ProcessId -Unique
    if (-not $remaining) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  $remainingIds = Get-WindieProcessCandidates | Select-Object -ExpandProperty ProcessId -Unique
  if ($remainingIds) {
    throw "Timed out waiting for WindieOS processes to exit: $($remainingIds -join ', ')"
  }
}

function Remove-PathWithRetries {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue,
    [int]$RetryCount = 5,
    [int]$RetryDelayMs = 750,
    [string[]]$ExcludeChildren = @(),
    [switch]$IgnoreFailure
  )

  if (-not (Test-Path -LiteralPath $PathValue)) {
    return $true
  }

  for ($attempt = 1; $attempt -le $RetryCount; $attempt++) {
    try {
      Remove-Item -LiteralPath $PathValue -Recurse -Force -ErrorAction Stop
      return $true
    } catch {
      if ($attempt -lt $RetryCount) {
        Start-Sleep -Milliseconds $RetryDelayMs
        continue
      }
    }
  }

  if ($ExcludeChildren.Count -gt 0 -and (Test-Path -LiteralPath $PathValue)) {
    Write-WarningLog "full removal failed for $PathValue; retrying while preserving volatile caches: $($ExcludeChildren -join ', ')"
    Get-ChildItem -LiteralPath $PathValue -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($ExcludeChildren -contains $_.Name) {
        return
      }
      Remove-PathWithRetries -PathValue $_.FullName -RetryCount 3 -RetryDelayMs 500 -IgnoreFailure | Out-Null
    }
    try {
      Remove-Item -LiteralPath $PathValue -Force -ErrorAction Stop
      return $true
    } catch {
      # Preserve the remaining excluded or locked children.
    }
  }

  if ($IgnoreFailure) {
    Write-WarningLog "leaving locked path in place: $PathValue"
    return $false
  }

  throw "Failed to remove path after retries: $PathValue"
}

function Invoke-BuildPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PythonBuildPath
  )

  Write-Log "building fresh Windows package"
  $previousPythonBuild = [Environment]::GetEnvironmentVariable("WINDIE_PYTHON_BUILD", "Process")
  $previousSidecarLogLevel = [Environment]::GetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", "Process")
  $previousVerboseSidecar = [Environment]::GetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "Process")

  [Environment]::SetEnvironmentVariable("WINDIE_PYTHON_BUILD", $PythonBuildPath, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $SidecarLogLevel, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "0", "Process")

  try {
    & npm --prefix $FrontendDir run package:win
    if ($LASTEXITCODE -ne 0) {
      throw "Windows packaging failed with exit code $LASTEXITCODE"
    }
  } finally {
    [Environment]::SetEnvironmentVariable("WINDIE_PYTHON_BUILD", $previousPythonBuild, "Process")
    [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $previousSidecarLogLevel, "Process")
    [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", $previousVerboseSidecar, "Process")
  }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "This script only supports Windows."
}

if (-not (Test-CommandExists "npm")) {
  throw "npm is required."
}

$bashPath = Ensure-BashAvailable
$PythonBuild = Get-FrontendPythonBuild
if (-not (Test-Path -LiteralPath $PythonBuild)) {
  throw "Python build interpreter not found: $PythonBuild"
}

Write-Log "repo=$RootDir"
Write-Log "frontend=$FrontendDir"
Write-Log "python_build=$PythonBuild"
Write-Log "bash=$bashPath"
Write-Log "sidecar_log_level=$SidecarLogLevel"
Write-Log "skip_data_reset=$($SkipDataReset.IsPresent)"
Write-Log "skip_launch=$($SkipLaunch.IsPresent)"

Invoke-WindowsPackagingPreflight

Write-Log "stopping running WindieOS processes"
Stop-WindieProcesses

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
    Remove-PathWithRetries -PathValue $installRoot -RetryCount 5 -RetryDelayMs 1000 | Out-Null
  }
}

if ($SkipDataReset) {
  Write-Log "skipping local app-state reset"
} else {
  $userDataDirs = @(
    (Join-Path $env:APPDATA $AppName),
    (Join-Path $env:LOCALAPPDATA $AppName),
    (Join-Path $env:LOCALAPPDATA "windieos-updater")
  ) | Select-Object -Unique

  Write-Log "removing local app state"
  foreach ($userDataDir in $userDataDirs) {
    $excludeChildren = @()
    if ($userDataDir -eq (Join-Path $env:APPDATA $AppName)) {
      $excludeChildren = $UserDataCacheExclusions
    }
    Remove-PathWithRetries `
      -PathValue $userDataDir `
      -RetryCount 5 `
      -RetryDelayMs 1000 `
      -ExcludeChildren $excludeChildren `
      -IgnoreFailure | Out-Null
  }
}

Write-Log "cleaning previous build artifacts"
foreach ($artifactPath in @(
  (Join-Path $FrontendDir "dist"),
  (Join-Path $FrontendDir "release"),
  (Join-Path $FrontendDir "python-runtime"),
  (Join-Path $FrontendDir "python-runtime.tar.gz")
)) {
  Remove-PathWithRetries -PathValue $artifactPath -RetryCount 5 -RetryDelayMs 1000 | Out-Null
}

Invoke-BuildPackage -PythonBuildPath $PythonBuild

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

if ($SkipLaunch) {
  Write-Log "skipping packaged app launch"
} else {
  Write-Log "launching installed packaged app $installedAppPath"
  $previousSidecarLogLevel = [Environment]::GetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", "Process")
  $previousVerboseSidecar = [Environment]::GetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $SidecarLogLevel, "Process")
  [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", "0", "Process")
  try {
    Start-Process -FilePath $installedAppPath | Out-Null
  } finally {
    [Environment]::SetEnvironmentVariable("WINDIE_SIDECAR_LOG_LEVEL", $previousSidecarLogLevel, "Process")
    [Environment]::SetEnvironmentVariable("WINDIE_VERBOSE_SIDECAR_STDERR", $previousVerboseSidecar, "Process")
  }
}

Write-Log "opening install location"
Start-Process explorer.exe "/select,`"$installedAppPath`"" | Out-Null

Write-Log "done"
