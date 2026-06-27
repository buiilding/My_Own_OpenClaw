---
summary: "Environment Setup"
read_when:
  - When setting up local environment.
---

# Environment Setup

## Requirements

- **Python** 3.11 (local-runtime Python)
- **Node.js** 18+ (frontend)
- **npm** (included with Node)

## Python Environment Options

You can use either `venv` or conda. The Electron local runtime resolves Python using:

- `CONDA_PREFIX` if set
- otherwise `python3` (Linux/macOS) or `py` (Windows) from `PATH`

### Option A: `venv`

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
cd frontend/src/main/python
pip install -r requirements.txt
```

### Option B: conda

```bash
conda create -n frontend_jarvis python=3.11
conda activate frontend_jarvis
pip install -r frontend/src/main/python/requirements.txt
```

## Environment-Aware Helper Scripts

Repo scripts can route commands into the canonical conda env when present:

- `frontend_jarvis` for local-runtime/frontend commands

Use:

```bash
./scripts/python-in-env.sh <local-runtime|frontend> <cmd...>
```

If conda or the target env is unavailable, this script falls back to your current shell environment.

Optional override:
- `WINDIE_FRONTEND_ENV`: override local-runtime/frontend env name (default `frontend_jarvis`)

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

Provider-specific hosted API keys are documented in private backend docs.
