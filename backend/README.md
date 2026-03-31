# WindieOS Backend

Backend service for WindieOS. It hosts agent orchestration, LLM integration, API routes, and backend-owned tool schema/runtime coordination.

## Runtime Requirements

- Python 3.11
- Optional conda env: `jarvis`
- API keys for any cloud LLM providers you use

## Install

From repository root:

```bash
pip install -r backend/requirements.txt
```

On Windows from the backend directory, you can run the bundled setup helper instead:

```powershell
.\setup-windows.ps1
```

That installs `requirements.txt`, upgrades `torch`/`torchvision`/`torchaudio` to the CUDA 12.8 wheels, removes `onnxruntime`, and installs `onnxruntime-gpu`.

On macOS, use the mac-specific backend manifest instead:

```bash
pip install -r backend/requirements_mac.txt
```

If you run Electron locally, also install sidecar deps:

```bash
pip install -r frontend/src/main/python/requirements.txt
```

## Run

From repository root:

```bash
./scripts/run-backend
```

Equivalent explicit form:

```bash
./scripts/python-in-env backend python -m backend.src.main
```

## Test

From repository root:

```bash
./scripts/test-backend
```

## Backend Layout

```
backend/src/
├── agent/         # Session lifecycle, interaction loop, tool lifecycle orchestration
├── api/           # FastAPI routes, websocket handlers, message formatting pipeline
├── core/          # Config, container bootstrap/runtime, events, infra, services
├── llm/           # Provider clients, parser, prompt construction, model metadata
├── tools/         # Tool registry, policy, orchestration, remote tool schema contracts
├── services/      # OCR, vision, artifacts, token services
├── sdk/           # Tool SDK interfaces used by backend tool definitions
├── embeddings/    # Embedding provider abstraction
├── simulation/    # Mock clients/simulation helpers
└── main.py        # App entrypoint
```

## Configuration

There is no YAML config file. Primary config models live in:

- `backend/src/core/config/app_config.py`
- `backend/src/core/config/models.py`

## Related Docs

- `docs/backend_architecture.md`
- `docs/api_reference.md`
- `docs/tool_system.md`
- `docs/llm_integration.md`
- `docs/configuration.md`
- `docs/developer_guide.md`
