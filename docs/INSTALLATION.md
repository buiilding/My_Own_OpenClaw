# Installation Guide

## Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Python**: 3.9 or higher
- **Node.js**: 18 or higher
- **npm**: Included with Node.js
- **Git**: For cloning the repository

### Hardware Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 5GB free space
- **GPU**: Optional but recommended for CUDA acceleration
- **Internet**: Required for cloud LLM providers

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ALL_OR_NOTHING
```

### 2. Backend Installation

#### Python Environment Setup

**Option A: Using venv (Recommended)**

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
conda create -n desktop-assistant-env python=3.9
conda activate desktop-assistant-env
```

#### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Verify Installation

```bash
python -m backend.src.main --help
```

### 3. Frontend Installation

#### Install Node.js Dependencies

```bash
cd frontend
npm install
```

#### Verify Installation

```bash
npm run dev --version
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

#### Configuration File

**Note**: The application uses Python-based configuration, not YAML files.

Configuration is defined in `backend/src/core/config/app_config.py` as the `APP_CONFIG` instance. Changes require editing the Python file and restarting the application.

API keys are loaded from environment variables (see above).

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
cd backend
python -m backend.src.main
```

**Terminal 2: Frontend Dev Server**
```bash
cd frontend
npm run dev
```

**Terminal 3: Electron App**
```bash
cd frontend
npm run electron
```

### Production Mode

**Build Frontend**:
```bash
cd frontend
npm run build
```

**Run Backend**:
```bash
cd backend
python -m backend.src.main
```

**Launch Electron**:
```bash
cd frontend
npm run electron
```

## Verification

### Check Backend

1. Backend should start on `http://0.0.0.0:8765`
2. Check logs for "Application startup complete"
3. Verify WebSocket endpoint: `ws://127.0.0.1:8765/ws`

### Check Frontend

1. Frontend dev server on `http://localhost:5173`
2. Electron window should open
3. Check connection status in UI

## Troubleshooting

### Python Issues

**Import Errors**:
```bash
# Ensure you're in the correct directory
cd backend
python -m backend.src.main
```

**Missing Dependencies**:
```bash
pip install -r requirements.txt
```

**Python Version**:
```bash
python --version  # Should be 3.9+
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
- System automatically falls back to CPU if CUDA unavailable

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
