# Environment Setup

## Requirements

- **Python** 3.9+ (backend + sidecar)
- **Node.js** 18+ (frontend)
- **npm** (included with Node)

## Conda Environments (Recommended)

Use two conda envs to match the current setup:

```bash
# Backend env
conda create -n jarvis python=3.9
conda activate jarvis

# Frontend/sidecar env
conda create -n frontend_jarvis python=3.9
```

## Backend Environment

```bash
conda activate jarvis
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Frontend Environment

```bash
conda activate frontend_jarvis
cd frontend
npm install
```

## Python Sidecar Environment

The Electron app spawns Python using:

- `CONDA_PREFIX` if available
- otherwise `python3` (Linux/macOS) or `py` (Windows)

Install sidecar dependencies into the active environment:

```bash
conda activate frontend_jarvis
cd frontend/src/main/python
pip install -r requirements.txt
```

## Environment Variables

Set API keys in your shell (example for OpenAI):

```bash
export OPENAI_API_KEY="your-key"
```

See `backend/src/core/config/models.py` for provider env variable names.
