---
summary: "Installation Guide"
read_when:
  - When installing app or dependencies.
---

# Installation Guide

## Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Python**: 3.11
- **Node.js**: 18 or higher
- **npm**: Included with Node.js
- **Git**: For cloning the repository

### Hardware Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 5GB free space
- **GPU**: Optional (only needed for CUDA acceleration)
- **Internet**: Required for cloud LLM providers

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd WindieOS
```

### 2. Backend Installation

#### Python Environment Setup

**Option A: Using venv**

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

**Option B: Using conda**

```bash
conda create -n jarvis python=3.11
conda activate jarvis
```

If you plan to run the Electron desktop app (whose main process starts local-runtime Python) and want a separate env:

```bash
conda create -n frontend_jarvis python=3.11
conda activate frontend_jarvis
```

#### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Verify Installation

```bash
cd ..
./scripts/python-in-env backend python -m backend.src.main --help
```

### 3. Frontend Installation

#### Install Node.js Dependencies

```bash
cd frontend
npm install
```

#### Install Local-Runtime Python Dependencies

The Electron app resolves Python from `CONDA_PREFIX` when set, otherwise
`python3` (Linux/macOS) or `py` (Windows) from `PATH`. Install the sidecar
dependencies into the same environment you will use to launch Electron:

```bash
cd frontend/src/main/python
pip install -r requirements.txt
```

#### Verify Installation

```bash
./scripts/python-in-env frontend npm --prefix ./frontend run dev -- --help
```

### 4. Configuration

#### Set Environment Variables

**Windows (PowerShell)**:
```powershell
$env:OPENAI_API_KEY = "your-api-key-here"
```

**macOS/Linux**:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

If Electron should connect to a backend running on another machine, set backend endpoint env vars before starting Electron:

```bash
export BACKEND_HOST="192.168.1.50"   # Backend machine IP or hostname
export BACKEND_PORT="8765"           # Optional (default 8765)
```

Or set full URLs explicitly:

```bash
export BACKEND_HTTP_URL="http://192.168.1.50:8765"
export BACKEND_WS_URL="ws://192.168.1.50:8765/ws"
```

`BACKEND_WS_URL` and `BACKEND_HTTP_URL` override `BACKEND_HOST`/`BACKEND_PORT` when provided.

Default endpoint behavior:

- Dev/source runs and packaged app runs both use hosted defaults: `https://api.windieos.com` and `wss://api.windieos.com/ws`.
- If the hosted backend is unreachable before the socket opens, the app reports the connection failure and does not silently switch to local backend candidates.
- Setting explicit `BACKEND_*` or `BACKEND_HOST`/`BACKEND_PORT` overrides these hosted defaults.

#### Configuration Locations

There is no YAML config file. Configuration is split between:

- **Backend**: `backend/src/core/config/app_config.py` (edit + restart)
- **Frontend**: `frontend-config.json` stored in Electron user data (saved by the UI)

## Hosted Backend

The intended product topology uses a hosted backend with an SDK local runtime backed by the local-runtime Python implementation. In that mode, installation can add:
- **Login**: OAuth or email/password.
- **Secure token storage** in OS keychain.
- **Plan selection** and billing portal access.
- **Usage meter** and limit warnings in the UI.

## Optional: GPU Support

### CUDA Setup (Optional)

For GPU acceleration:

1. **Install CUDA Toolkit**:
   - Windows: https://developer.nvidia.com/cuda-downloads
   - macOS: Not supported (use CPU)
   - Linux: `sudo apt install nvidia-cuda-toolkit`

2. **Install cuDNN** (if needed):
   - Follow NVIDIA instructions

3. **Verify CUDA**:
   ```bash
   nvidia-smi
   ```

### PyTorch with CUDA

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

## Running the Application

### Development Mode

**Terminal 1: Backend**
```bash
<windie> start backend
```

**Terminal 2: Desktop Dev Loop**
```bash
<windie> start dev
```

### Production Mode

**Build Frontend**:
```bash
cd frontend
npm run build
```

**Run Backend**:
```bash
<windie> start backend
```

**Launch Electron**:
```bash
<windie> start dev
```

### Package Installers (Frontend App)

From the repository root:

```bash
<windie> package win
<windie> package mac
<windie> package linux
```

Build artifacts are written to `frontend/release/`.

For local packaged-app reinstall testing helpers, use the repo scripts from the
workspace root:

- macOS: `<windie> reinstall mac`
- Windows (PowerShell): `bin\windie.cmd reinstall win`

The macOS helper is intentionally local-only: it clears all known TCC/privacy
grants for existing WindieOS app/helper bundle ids before reinstalling, strips
Apple notarization and Developer ID signing environment variables from the
build step so the reinstall does not wait on Apple, rebuilds the unpacked
`release/mac-arm64/WindieOS.app` bundle, reuses the existing packaged
`python-runtime` when `requirements.runtime.txt` and the runtime build script
have not changed, installs the app into `/Applications`, applies one
consistent ad-hoc signature to the installed app bundle, and relaunches that
installed app.

The Windows helper stops the installed app, clears WindieOS app data under
`%APPDATA%`/`%LOCALAPPDATA%`, rebuilds the bundled-runtime NSIS installer, runs
it silently, and relaunches the installed packaged app. It expects `npm`,
and a Python 3.11 build interpreter to be available; it auto-detects Git Bash
from standard install locations when `bash` is not already on `PATH`. Set
`WINDIE_PYTHON_BUILD` explicitly if the default `frontend_jarvis` resolution
does not match your machine. Useful local-testing switches:

- `-SkipDataReset`: keep `%APPDATA%` / `%LOCALAPPDATA%` state in place.
- `-SkipLaunch`: build + install without reopening the packaged app.

The script also warns up front when Developer Mode or symlink creation is not
available, because Electron's Windows packaging helpers can fail later during
installer creation when symlink privilege is missing.

### Linux `.deb` install/uninstall

For Linux package installs from `frontend/release/`:

- Package name is `windieos`.
- Install rebuilt `.deb`:

```bash
sudo apt install -y ./release/windieos_*_amd64.deb
```

- Uninstall:

```bash
sudo apt purge -y windieos
```

- If you need to remove orphaned dependencies, review first:

```bash
sudo apt autoremove --dry-run
```

Linux packaging/runtime notes:

- `.deb` and `.rpm` installers declare `xdotool` as a package dependency.
- AppImage does not auto-install system packages; install `xdotool` manually on Linux hosts for best `active_window` / window-switch behavior:

```bash
sudo apt install -y xdotool
```

If you host the backend separately, set endpoint env vars before launching the
packaged app:

```bash
export BACKEND_HTTP_URL="https://your-api.example.com"
export BACKEND_WS_URL="wss://your-api.example.com/ws"
```

You can also override hosted defaults without setting `BACKEND_*`:

```bash
export WINDIE_DEFAULT_BACKEND_HTTP_URL="https://your-api.example.com"
export WINDIE_DEFAULT_BACKEND_WS_URL="wss://your-api.example.com/ws"
```

The app still starts the local-runtime Python process for local tool execution.
Packaged builds look for Python in this order:

1. `WINDIE_PYTHON_PATH`
2. bundled runtime under app resources (`python-runtime`; Windows checks `python.exe` and `Scripts/python.exe`)

If neither path is valid, packaged startup reports bundled-runtime missing and does
not fall back to `CONDA_PREFIX` or system Python.

Permission model for packaged installs:

- Installers can bundle runtimes/dependencies, but OS privacy controls (microphone, screen capture, accessibility/input control) are granted by the user at runtime.
- WindieOS requests these permissions during first-launch onboarding and provides deep links to OS settings when required.
- Browser automation permission checks whether a Chromium runtime is already available; if missing, WindieOS asks user consent before installing Chromium for the bundled browser runtime.

For full frontend-only installer workflow (bundled runtime build + packaging),
see `docs/operations/sidecar_runtime_packaging.md`.

## Verification

### Check Backend

1. Backend should start on `http://0.0.0.0:8765`
2. Check logs for "Application startup complete"
3. Verify WebSocket endpoint: `ws://<backend-host>:8765/ws` (default local: `ws://127.0.0.1:8765/ws`)

### Check Frontend

1. Frontend dev server on `http://localhost:5173`
2. Electron window should open
3. Check connection status in UI

## Troubleshooting

### Python Issues

**Import Errors**:
```bash
# Run from the repository root so the `backend` package is importable
<windie> start backend
```

**Missing Dependencies**:
```bash
pip install -r requirements.txt
```

**Python Version**:
```bash
python --version  # Should be 3.11
```

### Node.js Issues

**npm Install Fails**:
```bash
# Clear cache
npm cache clean --force

# Reinstall
npm install
```

**Node Version**:
```bash
node --version  # Should be 18+
```

### Connection Issues

**Backend Not Starting**:
1. Check port 8765 is available
2. Verify Python dependencies installed
3. Check API key is set

**Frontend Not Connecting**:
1. Verify backend is running
2. Check WebSocket connection
3. Review browser console for errors

### GPU Issues

**CUDA Not Detected**:
1. Verify CUDA installation
2. Check GPU drivers
3. Test with `nvidia-smi`

**Fallback to CPU**:
- Some components (OCR/TTS/Vision) can fall back to CPU if CUDA is unavailable.
- The embedding provider is configured to use CUDA by default. If you do not have CUDA,
  change `device="cuda"` to `device="cpu"` in `backend/src/core/container/factories.py`
  or disable memory in `backend/src/core/config/app_config.py`.

## Platform-Specific Notes

### Windows

- Use PowerShell or Command Prompt
- Path separators: `\`
- Environment variables: `$env:VAR_NAME`

### macOS

- Use Terminal
- Path separators: `/`
- Environment variables: `export VAR_NAME`

### Linux

- Use Terminal
- Path separators: `/`
- Environment variables: `export VAR_NAME`
- May need `sudo` for system packages

## Next Steps

After installation:

1. **Configure Settings**: See Configuration Guide (private backend docs)
2. **Quick Start**: See [Quick Start Guide](quick_start.md)
3. **Read Documentation**: See [Documentation Index](../README.md)

---

For more help, see:
- [Troubleshooting Guide](troubleshooting.md)
- Configuration Guide (private backend docs)
- [Quick Start Guide](quick_start.md)
