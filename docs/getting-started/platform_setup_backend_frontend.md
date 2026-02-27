---
summary: "Backend + Frontend Environment Setup"
read_when:
  - When setting up backend and frontend local environments across Windows, Ubuntu, or macOS.
  - When validating CUDA/Torch/ONNX Runtime compatibility for OCR workloads.
---

# WindieOS Backend + Frontend Environment Setup (Windows, Ubuntu, macOS)

This guide sets up:

- Backend Python environment (Python 3.11)
- Backend dependencies from `backend/requirements.txt`
- CUDA-aware Torch + ONNX Runtime GPU verification for OCR workloads
- Frontend sidecar Python environment from `frontend/src/main/python/requirements.txt`
- Frontend Node dependencies and dev/electron launch checks

## 1) Backend setup (all platforms)

### 1.1 Install Python 3.11

- **Windows**: install Python 3.11 from python.org and check **"Add python.exe to PATH"**.
- **Ubuntu**:

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip
```

- **macOS** (Homebrew):

```bash
brew install python@3.11
```

### 1.2 Create backend virtualenv and install requirements

From repository root:

```bash
python3.11 -m venv .venv-backend311
source .venv-backend311/bin/activate  # Windows PowerShell: .venv-backend311\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

Notes:

- `backend/requirements.txt` already comments out `flash-attn`; do **not** install Flash Attention on Windows.
- Keep the rest of the requirements installed, including `onnxruntime-gpu`.

## 2) Backend OCR + CUDA integration workflow (RapidOCR)

### 2.1 Run backend with a 15s timeout to capture OCR provider logs

```bash
timeout 15s python -m backend.src.main
```

What to look for in the RapidOCR logs:

- `CUDAExecutionProvider is not in available providers...` (GPU EP not active)
- Or CUDA driver/runtime mismatch messages like `CUDA driver version is insufficient for CUDA runtime version`
- RapidOCR guidance that says to uninstall onnxruntime packages and install `onnxruntime-gpu`

### 2.2 Check torch + ONNX runtime state directly

```bash
python - <<'PY'
import torch, onnxruntime as ort
print('torch', torch.__version__)
print('torch.cuda.is_available', torch.cuda.is_available())
print('torch.version.cuda', torch.version.cuda)
print('onnx providers', ort.get_available_providers())
PY
```

GPU-ready expectation:

- `torch.cuda.is_available == True`
- `torch.version.cuda` matches host GPU CUDA support
- ONNX providers include `CUDAExecutionProvider`

### 2.3 Detect host GPU CUDA compatibility

- **Windows / Ubuntu with NVIDIA drivers**:

```bash
nvidia-smi
```

Use the reported CUDA/driver compatibility to select torch wheels.

### 2.4 Install CUDA-matched torch (example: CUDA 12.8)

```bash
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

Alternative example:

```bash
pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
```

### 2.5 Reinstall ONNX Runtime GPU exactly as RapidOCR suggests

If RapidOCR says to reinstall ONNX runtime packages:

```bash
pip uninstall -y onnxruntime onnxruntime-gpu
pip install --upgrade onnxruntime-gpu
```

Then rerun:

```bash
timeout 15s python -m backend.src.main
```

If CUDA still falls back to CPU, your NVIDIA driver is likely older than the CUDA runtime expected by installed wheels; update driver and reinstall the matching torch/onnxruntime-gpu versions.

## 3) Frontend sidecar Python setup

Create a second Python 3.11 environment for sidecar dependencies:

```bash
python3.11 -m venv .venv-sidecar311
source .venv-sidecar311/bin/activate  # Windows PowerShell: .venv-sidecar311\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r frontend/src/main/python/requirements.txt
```

## 4) Frontend Node setup + run

```bash
cd frontend
npm install
npm run dev
```

In another shell, start Electron and force it to use the sidecar Python 3.11 environment:

```bash
cd frontend
WINDIE_PYTHON_PATH=/absolute/path/to/WindieOS/.venv-sidecar311/bin/python npm run electron:dev
```

For Windows PowerShell:

```powershell
cd frontend
$env:WINDIE_PYTHON_PATH = "C:\path\to\WindieOS\.venv-sidecar311\Scripts\python.exe"
npm run electron:dev
```

For headless Linux containers/CI without a display server:

```bash
cd frontend
WINDIE_PYTHON_PATH=/absolute/path/to/WindieOS/.venv-sidecar311/bin/python xvfb-run -a npm run electron:dev
```

## 5) Connect frontend to backend (manual check)

1. Start backend:

```bash
source .venv-backend311/bin/activate
python -m backend.src.main
```

2. Start frontend renderer (`npm run dev`).
3. Start Electron (`npm run electron:dev`) with `WINDIE_PYTHON_PATH` set to the sidecar Python 3.11 interpreter.
4. Confirm frontend reaches backend websocket/API (default backend URL in this repo is typically `http://localhost:8765`).

## 6) Platform notes

### Windows

- Do not install Flash Attention.
- Do not install Flash Attention.
- If Electron fails to launch, install VC++ runtimes and ensure GPU driver is current.
- Prefer PowerShell activation commands shown above.

### Ubuntu

- OCR/GUI-related Python deps may need system libraries (`libgl1`, X11, GTK/ATK libs).
- Electron may require additional packages, e.g. `libatk1.0-0`, `libgtk-3-0`, `libnss3`, `libxss1`.
- If `npm run electron` reports `Electron failed to install correctly`, run `cd frontend && npm rebuild electron`.

Mode reminder:
- `npm run electron:dev` -> developer mode (recommended for development).
- `npm run electron` -> customer mode.

### macOS

- CUDA is generally not used (Apple Silicon uses MPS, Intel macs typically run CPU unless external NVIDIA + matching stack).
- Keep Torch default wheels unless you intentionally target a special accelerator setup.
