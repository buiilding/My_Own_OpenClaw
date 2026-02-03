# Testing Guide

## Backend + Sidecar Tests

```bash
cd /path/to/WindieOS
pytest
```

## Frontend Tests

```bash
cd frontend
npm test
```

## Notes

- `pytest` uses `pytest.ini` and runs `tests/backend` + `tests/sidecar`.
- Activate the Python environment that has backend/sidecar deps before running `pytest`.
- For CI parity: `cd frontend && npm run test:ci`.
- Frontend tests use Jest + React Testing Library.
- Frontend tests use Jest + React Testing Library.
