---
summary: "Planning hub for active WindieOS roadmap and future-facing plans."
read_when:
  - When deciding roadmap priorities or sequencing.
  - When adding a new future-facing plan doc.
---

# Planning Hub

Single entrypoint for active future work. Use this page first.

## Canonical Roadmap

- Company future framing: `WindieOS Company Future Overview (private backend docs)`
- Product roadmap and sequencing: `future_plan.md`
- Deployment and hosting rollout: Deployment Guide (private backend docs)
- Plan tiers and limits:
  - `plan_matrix.md`

## Initiative Plans (Execution Tracks)

- `windieos_mobile_app_plan.md`
- `windieos_self_edit_config_plan.md`
- `windieos_cli_os_control_plan.md`
- `WindieOS Agent-to-Agent Communication Plan (private backend docs)`
- `WindieOS VM Multi-Agent Plan (private backend docs)`

## Scope Rules

- Put cross-product strategy in `docs/planning/future_plan.md`.
- Put implementation-track plans in `docs/planning/*.md`.
- In feature docs (`architecture/*`, `getting-started/*`, root `README.md`), keep only short summaries and link back here.
- When a plan ships, move behavior docs to the relevant stable area and remove/trim the planning item.
- Do not describe planned behavior as current until implementation, docs, and validation are complete.
