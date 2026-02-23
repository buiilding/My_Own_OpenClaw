---
summary: "Planning Hub"
read_when:
  - When deciding roadmap priorities or sequencing.
  - When adding a new future-facing plan doc.
---

# Planning Hub

Single entrypoint for future work. Use this page first.

## Canonical Roadmap

- Product roadmap and sequencing: `FUTURE_PLAN.md`
- Deployment and hosting rollout: `../operations/DEPLOYMENT.md`
- Plan tiers and limits:
  - `PLAN_MATRIX.md`
  - `BILLING_AND_USAGE.md`
  - `USAGE_LIMITS.md`
  - `SECURITY_AND_COMPLIANCE.md`
  - `DATABASE_SCHEMA.md`

## Initiative Plans (Execution Tracks)

- `OS_LAYER_UX_EVOLUTION_PLAN.md`
- `STOP_BUTTON_END_TO_END_PLAN.md`
- `WINDIEOS_INSTALL_PERMISSION_ONBOARDING_PLAN.md`
- `WINDIEOS_MOBILE_APP_PLAN.md`
- `WINDIEOS_SELF_EDIT_CONFIG_PLAN.md`
- `WINDIEOS_SELF_UI_API_PLAN.md`
- `WINDIEOS_VM_MULTI_AGENT_PLAN.md`

## Scope Rules

- Put cross-product strategy in `docs/planning/FUTURE_PLAN.md`.
- Put implementation-track plans in `docs/planning/*.md`.
- In feature docs (`architecture/*`, `getting-started/*`, root `README.md`), keep only short summaries and link back here.
- When a plan ships, move behavior docs to the relevant stable area and remove/trim the planning item.
