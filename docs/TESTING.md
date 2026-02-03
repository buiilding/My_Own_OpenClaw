# Testing Guide

## Backend Tests

```bash
cd backend
pytest ../tests/backend
```

## Frontend Tests

```bash
cd frontend
npm test
```

## Notes

- Backend tests target tool pipelines and the query handler.
- Frontend tests use Jest + React Testing Library.
