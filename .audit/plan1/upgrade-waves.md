# Plan 1 Upgrade Waves

## Wave 1: Lint Coverage + Audit Rule Foundation

- Added dev dependencies:
  - `@typescript-eslint/parser`
  - `@typescript-eslint/eslint-plugin`
  - `eslint-plugin-react-compiler`
  - `eslint-plugin-deprecation`
  - `eslint-plugin-react-refresh` patch update
- Expanded frontend lint coverage to `js/jsx/cjs/ts/tsx`.
- Added TS parser override and CJS parser override in `.eslintrc.cjs`.
- Fixed existing lint blockers surfaced by broader coverage (unused vars, hook deps, TS catch var names, case block declaration).
- Added `frontend/tsconfig.eslint.json` for type-aware deprecation audit support.

Validation:
- `cd frontend && npm run lint` -> pass.
- `cd frontend && npm run lint:audit` -> pass (reports 4 deprecation warnings in voice hooks).

## Wave 2: Audit Tooling

- Added dev dependencies:
  - `jscpd`
  - `knip`
- Added scripts:
  - `npm run audit:jscpd`
  - `npm run audit:knip`

Validation:
- `cd frontend && npm run audit:jscpd` -> pass, report generated at `.audit/plan1/jscpd-report/jscpd-report.md`.
- `cd frontend && npm run audit:knip` -> pass, findings captured in `.audit/plan1/knip.txt`.

## Wave 3: Safe Patch/Minor Tool + Runtime Refresh

- Updated package ranges (non-breaking):
  - `@babel/core` -> `^7.29.0`
  - `@babel/preset-env` -> `^7.29.0`
  - `@babel/preset-react` -> `^7.28.5`
  - `baseline-browser-mapping` -> `^2.10.0`
  - `marked` -> `^17.0.3`
  - `systeminformation` -> `^5.31.1`
  - `ws` -> `^8.19.0`
  - `zustand` -> `^5.0.11`

Validation:
- `cd frontend && npm run lint` -> pass.
- `cd frontend && npm run build` -> pass.
- `cd frontend && npm run lint:audit` -> pass (same deprecation warnings remain).

## New dependency health checks

- `eslint-plugin-react-compiler`: `19.1.0-rc.2`, modified `2025-08-15`.
- `eslint-plugin-deprecation`: `3.0.0`, modified `2024-05-31`.
- `@typescript-eslint/parser`: `8.56.1`, modified `2026-02-23`.
- `jscpd`: `4.0.8`, modified `2026-01-30`.
- `knip`: `5.85.0`, modified `2026-02-21`.

