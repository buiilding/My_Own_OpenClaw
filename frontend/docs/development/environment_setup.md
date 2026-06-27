---
summary: "Environment Setup"
read_when:
  - When setting up local environment.
---

# Environment Setup

## Requirements

- **Python** 3.11 (backend + local-runtime Python)
- **Node.js** 18+ (frontend)
- **npm** (included with Node)

## Python Environment Options

You can use either `venv` or conda. The Electron local runtime resolves Python using:

- `CONDA_PREFIX` if set
- otherwise `python3` (Linux/macOS) or `py` (Windows) from `PATH`

### Option A: `venv` (single env)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

Install local-runtime Python deps into the same env you will use to launch Electron:

```bash
cd frontend/src/main/python
pip install -r requirements.txt
```

### Option B: conda

```bash
conda create -n jarvis python=3.11
conda activate jarvis
pip install -r backend/requirements.txt
```

If you want a separate env for the local-runtime Python implementation:

```bash
conda create -n frontend_jarvis python=3.11
conda activate frontend_jarvis
pip install -r frontend/src/main/python/requirements.txt
```

## Environment-Aware Helper Scripts

Repo scripts can route commands into the canonical conda envs when present:

- `jarvis` for backend commands
- `frontend_jarvis` for local-runtime/frontend commands

Use:

```bash
./scripts/python-in-env.sh <backend|local-runtime|frontend> <cmd...>
```

If conda or the target env is unavailable, this script falls back to your current shell environment.

Optional overrides:
- `WINDIE_BACKEND_ENV`: override backend env name (default `jarvis`)
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

See `backend/src/core/config/models.py` for provider env variable names.
