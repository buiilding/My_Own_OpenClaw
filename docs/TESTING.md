# Testing Guide

## Backend Tests

```bash
conda activate jarvis
cd backend
pytest ../tests/backend
```

## Frontend Tests

```bash
conda activate frontend_jarvis
cd frontend
npm test
```

## Notes

- Backend tests target tool pipelines and the query handler.
- Frontend tests use Jest + React Testing Library.
