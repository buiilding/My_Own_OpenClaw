---
summary: "Roadmap status matrix for WindieOS planning tracks, separating implemented surfaces, active implementation tracks, future plans, and speculative architecture."
read_when:
  - When choosing which planning doc to read for a roadmap, hosted, VM, mobile, plugin, billing, inference, or UX initiative.
  - When updating the planning hub after a plan ships or changes status.
title: "Roadmap Status Matrix"
---

# Roadmap Status Matrix

This matrix helps agents choose the right planning doc without treating every plan as active implementation work.

## Matrix

| Track | Current status | Primary docs | Stable-doc destination when shipped |
| --- | --- | --- | --- |
| packaged desktop + bundled sidecar runtime | implemented, still evolving | [Frontend + Sidecar Packaging Plan](windieos_frontend_sidecar_packaging_plan_2026-02-25.md) | [Install Hub](../install/README.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) |
| hosted backend + Cloudflare ingress | implemented deployment path | [Future Product Plan](future_plan.md), [Deployment](../operations/deployment.md) | [Gateway Hub](../gateway/README.md), [Operations Hub](../operations/README.md) |
| VM runs API and Electron VM worker | implemented control-plane slice | [VM Multi-Agent Plan](windieos_vm_multi_agent_plan.md), [Automation Hub](../automation/README.md) | [Automation Hub](../automation/README.md), [Runtime Nodes Hub](../nodes/README.md) |
| one-agent-per-VM runtime and remote control | planned | [VM Multi-Agent Plan](windieos_vm_multi_agent_plan.md) | nodes, automation, operations, security |
| mobile companion | planned | [Mobile App Plan](windieos_mobile_app_plan.md) | nodes, channels, web/API client docs |
| agent-to-agent communication | planned | [Agent-to-Agent Communication Plan](windieos_agent_to_agent_communication_plan.md) | automation, nodes, security |
| plugin marketplace/dynamic plugin loading | future planning only | [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md) | plugins, security, operations |
| hosted billing/usage limits | planned | [Billing and Usage](billing_and_usage.md), [Usage Limits](usage_limits.md), [Plan Matrix](plan_matrix.md) | concepts usage, operations, security |
| inference provider routing | implemented/refactor track | [Inference Provider Refactor Plan](windieos_inference_provider_refactor_plan_2026-04-15.md) | providers, backend services, operations |
| external inference services/worker pools | future architecture | [Inference Services Future Plan](windieos_inference_services_future_plan_2026-04-15.md) | operations, backend services, gateway |
| chat surface simplification | active/refactor plan | [Frontend Chat Surface Refactor Plan](windieos_frontend_chat_surface_refactor_plan_2026-04-01.md) | desktop, frontend renderer, platform docs |
| OS-layer UX evolution | future UX direction | [OS Layer UX Evolution Plan](os_layer_ux_evolution_plan.md) | desktop, platforms, security |
| self-editing configuration | planned/guarded | [Self Edit Config Plan](windieos_self_edit_config_plan.md) | frontend settings, security, concepts |
| CLI OS control | planned | [CLI OS Control Plan](windieos_cli_os_control_plan.md) | cli, tools, security |

## Update Rule

When a track ships:

1. move current behavior into stable docs
2. add validation paths to stable docs
3. update this matrix status
4. trim stale planned language
5. update [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md) when a new docs section becomes first-class

## Related Docs

- [Current vs Future Boundary](current_vs_future_boundary.md)
- [Plan Promotion Checklist](plan_promotion_checklist.md)
- [Initiative Index](initiative_index.md)
