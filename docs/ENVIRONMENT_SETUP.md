# Environment Setup

## Requirements

- **Python** 3.9+ (backend + sidecar)
- **Node.js** 18+ (frontend)
- **npm** (included with Node)

## Python Environment Options

You can use either `venv` or conda. The Electron sidecar resolves Python using:

- `CONDA_PREFIX` if set
- otherwise `python3` (Linux/macOS) or `py` (Windows) from `PATH`

### Option A: `venv` (single env)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

Install sidecar deps into the same env you will use to launch Electron:

```bash
cd frontend/src/main/python
pip install -r requirements.txt
```

### Option B: conda

```bash
conda create -n jarvis python=3.9
conda activate jarvis
pip install -r backend/requirements.txt
```

If you want a separate env for the sidecar:

```bash
conda create -n frontend_jarvis python=3.9
conda activate frontend_jarvis
pip install -r frontend/src/main/python/requirements.txt
```

## Frontend Environment

```bash
cd frontend
npm install
```

## Environment Variables

Set API keys in your shell (example for OpenAI):

```bash
export OPENAI_API_KEY="your-key"
```

See `backend/src/core/config/models.py` for provider env variable names.
