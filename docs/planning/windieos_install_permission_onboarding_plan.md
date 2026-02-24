---
summary: "Plan for install-time permission-first onboarding so users explicitly grant all WindieOS-required capabilities before normal use."
read_when:
  - Designing first-run UX and installer/onboarding flow.
  - Implementing OS permission checks, prompts, and gating.
  - Defining capability policy for current and planned WindieOS features.
---

# WindieOS Install Permission Onboarding Plan

## Objective

On first app launch after install, require users to complete a permission-first onboarding flow that covers all capabilities WindieOS currently uses and is expected to use in planned system-access mode.

Target behavior:
- User sees a dedicated onboarding wizard before normal chat/dashboard usage.
- Wizard explains each capability, why it is needed, and what data/actions it enables.
- Wizard verifies permission state with real checks (not only UI toggles).
- WindieOS hard-gates tool families until required permissions are granted.

## Product Principle

Permission collection must be explicit and auditable:
- No silent escalation.
- No hidden fallback that bypasses denied permissions.
- Clear distinction between:
  - `required_now` (current shipped behavior)
  - `required_for_planned_system_access` (future capabilities the product intends to support)

## Current Capability Surface (Baseline)

Current backend-exposed sidecar tool set (source: `frontend/src/main/python/tools/registry.py`):
- Computer control: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_tab`, `wait`
- Filesystem: `read_file`, `replace`
- System: `get_open_windows`, `get_system_stats`, `run_shell_command`, `process`
- Browser: `browser`

Current settings UI already has a `Permissions` section placeholder in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`, but no real permission workflow or gating enforcement.

## Permission Manifest Model

Introduce a versioned permission manifest as the source of truth.

Suggested schema:
- `permission_id`
- `label`
- `description`
- `risk_level` (`low|medium|high`)
- `required_now` (bool)
- `required_for_planned_system_access` (bool)
- `os_scope` (`macos|windows|linux|all`)
- `validation_probe` (technical check)
- `unlocks_tool_groups` (list)

Suggested initial permissions:
- `screen_capture`:
  - Needed for screenshots and visual context.
  - Unlocks: `screenshot`, computer-use post-action capture.
- `input_control_accessibility`:
  - Needed for mouse/keyboard/scroll/window automation.
  - Unlocks: `mouse_control`, `keyboard_control`, `scroll_control`, `switch_tab`.
- `microphone`:
  - Needed for wakeword/voice mode.
  - Unlocks: voice pipeline features.
- `filesystem_workspace_access`:
  - Needed for read/replace operations in target directories.
  - Unlocks: `read_file`, `replace`.
- `shell_execution`:
  - Needed for command execution/process management.
  - Unlocks: `run_shell_command`, `process`.
- `browser_automation`:
  - Needed for browser control runtime and CDP flows.
  - Unlocks: `browser`.
- `planned_system_access` (future flag group):
  - Declared in onboarding for future capabilities.
  - Remains disabled in runtime until feature ships.

## UX Plan: First-Run Permission Wizard

## Step 0: Intro + Consent

Screen includes:
- Capability summary (what WindieOS can do).
- Strong warning that computer-control and shell capabilities are powerful.
- Explicit "Continue to Permission Setup" CTA.

## Step 1: Permission Checklist (Required Now)

Show required-now permissions with per-item status:
- `Not checked`
- `Needs action`
- `Granted`

Each permission row includes:
- Why needed.
- Example action it enables.
- "Grant" button and "Re-check" button.

## Step 2: Planned System-Access Disclosure

Separate panel for future capabilities:
- Explain planned system-access behavior and expected permission requirements.
- Obtain explicit policy consent (`I understand future system-access scope`).
- Do not mark runtime permissions as granted until actual OS-level checks pass when feature is released.

## Step 3: Verification + Final Gate

Before entering normal UI:
- Run all validation probes.
- If any required-now permission is missing:
  - Keep user in onboarding.
  - Provide OS-specific remediation steps.

## Step 4: Post-Onboarding Control Center

Replace current placeholder "Permissions" section with:
- Live status of each permission.
- Last verification timestamp.
- "Re-run checks" action.
- Tool groups currently locked due to missing permissions.

## OS-Specific Implementation Plan

## macOS

Handle via guided flow for:
- Screen Recording
- Accessibility
- Microphone

Implementation notes:
- Some macOS permissions are only promptable after first API access attempt.
- Use probe actions (safe no-op captures/input checks) to trigger prompts, then re-check.
- Deep-link/open System Settings where possible.

## Windows

Handle:
- Microphone privacy permissions.
- Desktop automation prerequisites (UI automation availability).
- Optional UAC/elevation boundary messaging for protected operations.

Implementation notes:
- Validate using functional probes, not assumptions that permission is always available.

## Linux

Handle:
- X11/Wayland screen-capture and input constraints.
- `xdotool`/desktop-session compatibility checks.
- Microphone access for voice features.

Implementation notes:
- Provide distro/session-specific guidance where known.
- Surface unsupported environments explicitly instead of silent failure.

## Technical Architecture Changes

## 1) Permission Service (Frontend Main + Sidecar Bridge)

Add a new permission service layer in frontend main process:
- `checkPermission(permission_id)`
- `requestPermission(permission_id)`
- `runPermissionProbe(permission_id)`

Expose via new IPC channels (allowlisted in `frontend/src/preload.js`).

## 2) Permission State Store (Renderer)

Add a dedicated store/context in renderer:
- Current status per permission.
- Manifest version.
- Last probe result.
- Lock reasons for disabled features.

## 3) Tool Gating Enforcement

Enforce in two places:
1. Frontend tool runner gate:
- Block local tool execution if required permission missing.
2. Backend tool policy gate:
- Prevent tool schema exposure/call dispatch when client reports missing permissions.

This avoids mismatch where UI hides a feature but backend still emits the tool.

## 4) Onboarding Gate in App Startup

At startup:
- If onboarding incomplete or manifest version changed:
  - Route to onboarding flow first.
- Only unlock normal chat/dashboard once required-now permissions are verified.

## Security and Compliance Requirements

- Permission grants/denials are audit logged (local + hosted mode if enabled).
- Any change in permission state invalidates dependent active tool sessions.
- Denied high-risk permissions must not degrade into hidden permissive behavior.
- Permission copy must be plain-language and specific about data/action scope.

## Rollout Phases

## Phase 0: Manifest + UX Specification

Deliverables:
- Final permission manifest and risk classifications.
- UX wireframes for first-run wizard and settings permission center.
- OS probe definitions.

Exit criteria:
- Product + engineering + security sign-off.

## Phase 1: Technical Foundation

Deliverables:
- Permission service interfaces in frontend main.
- IPC contracts and renderer state store.
- Probe scaffolding for macOS/Windows/Linux.

Exit criteria:
- Permission checks callable end-to-end from renderer.

## Phase 2: Onboarding Wizard + Hard Gating

Deliverables:
- First-run permission wizard flow.
- Startup gate enforcement.
- Tool family lock/unlock integration.

Exit criteria:
- Users cannot use gated tool families until required permissions are granted.

## Phase 3: Backend Policy Sync

Deliverables:
- Client permission capability payload on handshake/session init.
- Backend tool-policy filtering by granted capabilities.

Exit criteria:
- Backend no longer emits tool calls unavailable by permission state.

## Phase 4: Planned System-Access Consent + Telemetry

Deliverables:
- Planned-capability disclosure screen.
- Consent/audit event pipeline.
- Funnel metrics (grant/drop-off/retry).

Exit criteria:
- Permission onboarding conversion and failure analytics available.

## Test Plan

## Unit

- Manifest parsing/version migration.
- Permission state transitions.
- Tool gating decision logic.

## Integration

- First-run routing to wizard.
- Grant/deny/revoke flows.
- IPC permission checks across renderer-main-sidecar.

## OS Validation

- macOS: Screen Recording + Accessibility + Microphone probes.
- Windows: Microphone + automation checks.
- Linux: X11/Wayland capture/input compatibility checks.

## Regression

- Existing non-permission features still accessible when unrelated permissions denied.
- No backend tool schema drift under permission-gated mode.

## Success Metrics

- First-run permission completion rate.
- Time-to-complete onboarding.
- Percentage of sessions blocked due to missing permissions.
- Reduction in permission-related support tickets (screenshot/input failures).

## Definition of Done

This initiative is complete when:
- New installs always start in permission onboarding.
- Required-now permissions are verified before tool-capable usage.
- Tool families are reliably gated by permission state in frontend and backend policy paths.
- Users have a persistent permission control center with re-check/remediation actions.
- Planned system-access consent is captured separately without misrepresenting runtime grants.
