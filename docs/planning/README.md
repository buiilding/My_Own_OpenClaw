---
summary: "Planning Hub"
read_when:
  - When deciding roadmap priorities or sequencing.
  - When adding a new future-facing plan doc.
---

# Planning Hub

Single entrypoint for future work. Use this page first.

## Canonical Roadmap

- Company future framing: `windieos_company_future_overview.md`
- Product roadmap and sequencing: `future_plan.md`
- Deployment and hosting rollout: `../operations/deployment.md`
- Plan tiers and limits:
  - `plan_matrix.md`
  - `billing_and_usage.md`
  - `usage_limits.md`
  - `security_and_compliance.md`
  - `database_schema.md`

## Initiative Plans (Execution Tracks)

- `os_layer_ux_evolution_plan.md`
- `windieos_install_permission_onboarding_plan.md`
- `windieos_mobile_app_plan.md`
- `windieos_self_edit_config_plan.md`
- `windieos_cli_os_control_plan.md`
- `windieos_agent_to_agent_communication_plan.md`
- `windieos_vm_multi_agent_plan.md`
- `windieos_frontend_sidecar_packaging_plan_2026-02-25.md`
- `windieos_browser_use_hard_merge_plan_2026-02-25.md`
- `windieos_backend_web_search_tool_plan_2026-02-26.md`
- `windieos_refactor_plan_2026-02-23.md`
- `windieos_conversation_history_compaction_plan_2026-02-24.md`

## Scope Rules

- Put cross-product strategy in `docs/planning/future_plan.md`.
- Put implementation-track plans in `docs/planning/*.md`.
- In feature docs (`architecture/*`, `getting-started/*`, root `README.md`), keep only short summaries and link back here.
- When a plan ships, move behavior docs to the relevant stable area and remove/trim the planning item.
