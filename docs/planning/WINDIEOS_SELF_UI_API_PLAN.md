---
summary: "Implementation plan for letting WindieOS interact with its own UI through safe internal APIs instead of brittle click automation."
read_when:
  - Designing agent self-interaction mode for settings/skills flows.
  - Choosing between UI state APIs vs raw DOM/pixel automation.
  - Defining guardrails for autonomous in-product maintenance actions.
---

# WindieOS Self-UI API Plan

## Objective

Enable WindieOS to perform bounded self-maintenance actions in its own UI via typed internal APIs, not raw click-by-coordinate automation.

Primary target flows:
- Navigate to safe dashboard sections.
- Change allowlisted user settings.
- Guide `SKILLS.md` authoring workflow.
- Show/hide product surfaces needed for guided maintenance.

## Why This Approach

Current tool path is sidecar-first and optimized for OS/browser actions. For app-internal UX, direct intent APIs are more stable, testable, and secure than selector/pixel clicks.

Relevant baseline:
- Planned roadmap item: `docs/planning/FUTURE_PLAN.md` (self-interaction mode, safe subset, audit trail).
- Current sidecar execution path: `frontend/src/main/local_backend_bridge.cjs` (`execute-tool` handler).
- Current frontend-owned settings path: `frontend/src/renderer/app/providers/AppConfigProvider.jsx` (`updateConfig`).
- Backend allowlist validation: `backend/src/api/schemas/incoming.py`, `backend/src/core/validation/validators.py`.

## Scope

In scope (v1):
- Internal action API for safe views and settings.
- Agent-facing tool contracts that call this internal API.
- Self-interaction mode gate + audit logging.
- Timeboxing/kill-switch protections.

Out of scope (v1):
- Generic unrestricted `ui.click` / `ui.type` against arbitrary selectors.
- Editing protected system/auth/billing/security files.
- Silent autonomous behavior without explicit user-visible mode.

## Design Principles

1. State API first, automation second.
2. Allowlist-only action surface.
3. Reuse existing persistence + backend sync paths.
4. Explicit mode + visible telemetry/audit.
5. Fast disable path (kill switch) always available.

## Proposed Architecture

## Layer 1: Renderer Intent Service

Add a renderer-local service that accepts typed semantic actions:
- `navigate.section`
- `settings.set`
- `skills.create_draft`
- `window.show_main`
- `chatbox.show`
- `chatbox.hide`

Rules:
- No raw selector input in v1.
- Input validated against enum/allowlist.
- Returns structured success/error payload.

Suggested location:
- `frontend/src/renderer/infrastructure/ui_actions/` (new)

## Layer 2: Main Process Action Broker

Add one IPC invoke channel:
- `execute-ui-action`

Responsibilities:
- Validate action envelope.
- Route action to main dashboard renderer (safe target).
- Enforce mode + timeout + per-turn action budget.
- Return action result + telemetry metadata.

Suggested touchpoints:
- `frontend/src/main/index.cjs`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`

## Layer 3: Agent-Facing Tool Contracts

Expose explicit backend tools for self-UI intents:
- `ui_navigate`
- `ui_update_setting`
- `ui_skills_draft`

Contract style:
- Strict schemas.
- Limited enums and payload keys only.
- No arbitrary script execution.

Notes:
- Keep these separate from sidecar computer-use tools.
- Avoid routing self-UI calls through Python sidecar `execute_tool`.

## Layer 4: Existing Config Pipeline Reuse

For settings changes, always call existing frontend config mutation path:
- `updateConfig(...)` in `AppConfigProvider`.

This preserves:
- localStorage persistence
- disk persistence (`save-frontend-config`)
- backend runtime sync (`update-settings`)
- backend schema enforcement and allowlist filtering

## Safety Model

Hard gates:
- Feature flag: `self_ui_api_enabled` (default off initially).
- Session flag: `self_interaction_mode_active`.
- Safe-view allowlist (settings/procedural only in v1).
- Safe-action allowlist (typed actions only).

Runtime controls:
- TTL per self-interaction session.
- Max actions per turn/session.
- Recursive-loop guard (block agent-generated action storms).
- Immediate kill switch UI control.

Transparency:
- Banner when mode active.
- Append-only audit trail per action:
  - timestamp
  - actor
  - action
  - args (sanitized)
  - result
  - turn_ref / conversation_ref

## Rollout Plan

## Phase 0: Contracts + Guardrails
- Define action schema + error schema.
- Define allowlisted views/actions.
- Define audit event format.

## Phase 1: Minimal Action API
- Implement `execute-ui-action`.
- Implement `navigate.section` + window visibility actions.
- Wire banner + mode state.

## Phase 2: Settings Actions
- Implement `settings.set` through `updateConfig`.
- Restrict fields to frontend allowlist.
- Add confirmation events/messages.

## Phase 3: Skills Workflow
- Add guided `skills.create_draft` flow.
- Require explicit user confirmation before write/apply steps.

## Phase 4: Optional Controlled Generic Actions
- Consider `ui.click/ui.type` only with stable target IDs.
- Keep strict target registry; no arbitrary selectors.

## Testing Plan

Unit:
- Action schema validation.
- Allowlist enforcement.
- Loop/TTL/action-budget guards.

Integration:
- IPC `execute-ui-action` request/response lifecycle.
- `settings.set` end-to-end persistence + backend sync.
- Audit event emission for success/failure paths.

E2E:
- Toggle self-interaction mode on/off.
- Agent navigates to settings and applies allowed changes.
- Kill switch interrupts active self-interaction session.

## Success Criteria

- Self-maintenance flows succeed without coordinate/selector fragility.
- Zero unauthorized action classes executed.
- Full action traceability in audit log.
- No regressions in existing sidecar computer-use tool flow.

## Open Questions

1. Should self-interaction mode require per-session user confirmation or per-action confirmation in v1?
2. Should settings mutations via self-UI API reuse deterministic intent resolver patterns from `WINDIEOS_SELF_EDIT_CONFIG_PLAN.md`?
3. Where should audit history be surfaced first: chat timeline, dashboard panel, or both?
