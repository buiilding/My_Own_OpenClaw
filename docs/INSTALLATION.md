---
summary: "Installation Guide"
read_when:
  - When installing app or dependencies.
---

# Installation Guide

## Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Python**: 3.11 or higher
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

If you plan to run the Electron frontend (which spawns the Python sidecar) and want a separate env:

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

#### Install Python Sidecar Dependencies

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

#### Configuration Locations

There is no YAML config file. Configuration is split between:

- **Backend**: `backend/src/core/config/app_config.py` (edit + restart)
- **Frontend**: `frontend-config.json` stored in Electron user data (saved by the UI)

## Hosted Backend (Planned)

When the hosted backend is available, installation adds:
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
./scripts/run-backend
```

**Terminal 2: Frontend Dev Server**
```bash
./scripts/run-frontend-dev
```

**Terminal 3: Electron App**
```bash
./scripts/run-frontend-electron
```

### Production Mode

**Build Frontend**:
```bash
cd frontend
npm run build
```

**Run Backend**:
```bash
./scripts/run-backend
```

**Launch Electron**:
```bash
./scripts/run-frontend-electron
```

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
./scripts/run-backend
```

**Missing Dependencies**:
```bash
pip install -r requirements.txt
```

**Python Version**:
```bash
python --version  # Should be 3.11+
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

1. **Configure Settings**: See [Configuration Guide](CONFIGURATION.md)
2. **Quick Start**: See [Quick Start Guide](QUICK_START.md)
3. **Read Documentation**: See [Documentation Index](README.md)

---

For more help, see:
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Configuration Guide](CONFIGURATION.md)
- [Quick Start Guide](QUICK_START.md)
