---
summary: "Implementation plan for a first-class WindieOS CLI that supports query execution, UI control, local/remote agent orchestration, and cross-OS agent connectivity."
read_when:
  - Planning a terminal-first WindieOS workflow similar to Codex/Cursor/Claude Code.
  - Designing CLI-driven UI automation and agent orchestration.
  - Defining cross-OS agent connection and policy boundaries.
---

# WindieOS CLI + OS Control Plan

## Objective

Ship a terminal-native WindieOS CLI that feels like Codex/Cursor/Claude Code, with one major extension:
- CLI can drive WindieOS UI automation safely.
- CLI can run/monitor agents.
- CLI can connect to other WindieOS agents running on different operating systems.

Target outcome:
- One command surface (`windie`) for query, tools, UI control, and multi-agent operations.
- Consistent local + remote control model with audit trail.
- Policy-gated cross-OS collaboration instead of ad hoc peer control.

## Scope

In scope:
- CLI command taxonomy and UX.
- Local control daemon + backend integration.
- UI control contract from CLI.
- Agent lifecycle commands (local and remote).
- Cross-OS agent discovery/connect/session model.
- Security, auth, audit, and rollout phases.

Out of scope (v1):
- Fully autonomous mesh with no policy or approvals.
- Arbitrary unauthenticated peer-to-peer control channels.
- Plugin ecosystem for 3rd-party CLI extensions.

## Product Surface

Single binary:
- `windie`

Primary command groups:
- `windie query ...`
- `windie ui ...`
- `windie agent ...`
- `windie remote ...`
- `windie session ...`
- `windie auth ...`
- `windie logs ...`

Design goals:
- Fast feedback (`stream`, `--json`, machine-readable exit codes).
- Safe defaults (dry-run/preview for risky UI actions).
- Same semantics across macOS/Windows/Linux where platform allows.

## Core User Flows

1) Query flow (Codex/Cursor-like terminal loop)
- User runs `windie query "fix failing tests"` in repo.
- CLI streams assistant output and tool events.
- User can accept/apply patches, continue, or cancel.

2) Local UI control flow
- User runs `windie ui click --target "Save button"` or `windie ui type --text "hello"`.
- CLI requests action preview.
- User confirms high-risk action.
- Action executes through the existing local-runtime tool path.

3) Agent runtime flow
- User runs `windie agent run --name planner --profile code`.
- CLI shows state: `provisioning -> ready -> running`.
- User monitors with `windie agent logs planner --follow`.

4) Cross-OS remote agent flow
- User pairs remote Windie node: `windie remote connect my-macbook`.
- User starts handoff: `windie agent handoff --to my-macbook:agent-b "run ui test"`.
- CLI shows thread status, updates, result artifacts.

## Architecture

### 1. CLI Client (`windie`)

Responsibilities:
- Parse command + flags.
- Render streaming output.
- Handle non-interactive and interactive modes.
- Persist local profile, auth token, and target aliases.

Implementation notes:
- Start with Python-based CLI inside current backend stack for fastest integration.
- Keep command handlers thin; push orchestration logic into shared service layer.

### 2. Local Control Daemon (`windied`, optional but recommended)

Responsibilities:
- Maintain long-lived backend/ws sessions.
- Cache session state and active agent handles.
- Manage retries/backoff and offline queue for non-destructive commands.

Rationale:
- Keeps CLI invocations stateless while preserving streaming continuity.
- Reduces handshake overhead for frequent command usage.

### 3. Control Plane Integration

Reuse and extend existing backend contracts:
- Query execution pipeline (`/ws` + current message routes).
- Agent lifecycle and tool orchestration internals.
- Future alignment with:
  - `windieos_agent_to_agent_communication_plan.md`
  - `windieos_vm_multi_agent_plan.md`

### 4. UI Control Bridge

Command path:
- `windie ui ...` -> control plane/daemon -> local-runtime tool registry ->
  platform action.

Action families (v1):
- `click`, `double-click`, `type`, `hotkey`, `scroll`, `wait`, `screenshot`.

Action requirements:
- Target resolution metadata (`point`, optional `rect`, confidence).
- Preview payload before execution when available.
- Correlated request IDs for audit/replay.

### 5. Cross-OS Agent Fabric

Model:
- Hub-and-spoke via control plane broker (default).
- Optional direct peer transport later, still policy-gated.

Capabilities:
- Remote node registration + trust handshake.
- Agent directory (node, OS, capabilities, status).
- Threaded handoff messages with result artifacts.

Identity:
- `workspace_id`, `node_id`, `agent_id`, `thread_id`, `message_id`.

## CLI Contract Draft

### Query Commands

- `windie query "<prompt>" [--cwd <path>] [--model <id>] [--stream] [--json]`
- `windie query resume <conversation_ref>`
- `windie query stop <request_id>`

### UI Commands

- `windie ui snapshot [--json]`
- `windie ui click --target "<selector|text|coords>"`
- `windie ui type --text "<input>"`
- `windie ui hotkey --keys "ctrl+s"`
- `windie ui run "<natural language action>" --approve <auto|prompt>`

### Agent Commands

- `windie agent list`
- `windie agent run --name <name> [--profile <profile>]`
- `windie agent pause <agent_id>`
- `windie agent resume <agent_id>`
- `windie agent stop <agent_id>`
- `windie agent logs <agent_id> --follow`

### Remote Commands

- `windie remote list`
- `windie remote connect <node_alias>`
- `windie remote disconnect <node_alias>`
- `windie remote ping <node_alias>`
- `windie agent handoff --to <node_alias:agent_id> "<task>"`

## Security and Policy

Required controls:
- Strong auth for CLI session (`auth login`, token refresh, local secure storage).
- Policy gate per command family (`query`, `ui`, `agent`, `remote`).
- High-risk action approval for destructive UI or shell actions.
- Payload/schema validation at every transport boundary.
- Audit event emission for each command and resulting side effects.

Default policy recommendations:
- `ui.*` allowed local-only until explicit remote enablement.
- `remote connect` requires explicit trust-pair handshake.
- File transfer/clipboard across nodes disabled by default.

## Phased Rollout

### Phase 0: RFC + Contracts

Deliverables:
- CLI command taxonomy spec.
- API contract for query/ui/agent/remote command envelopes.
- Threat model for cross-OS command relay and UI control abuse.

Exit criteria:
- Contract freeze for v1 command families.
- Security sign-off for auth/policy model.

### Phase 1: Query-First CLI (Local)

Deliverables:
- `windie query` command family with streaming output.
- Resume/stop support and stable machine-readable JSON mode.
- Basic telemetry + command audit logging.

Exit criteria:
- End-to-end local query workflow parity with desktop chat for core tasks.

### Phase 2: Local UI Control from CLI

Deliverables:
- `windie ui` commands mapped to existing local-runtime control tools.
- Preview + confirmation flow for risky actions.
- Screenshot/snapshot inspection commands.

Exit criteria:
- Reliable click/type/hotkey flows on supported OS targets with audit trail.

### Phase 3: Agent Lifecycle Commands

Deliverables:
- `windie agent` run/list/pause/resume/stop/logs commands.
- Command-to-state mapping with deterministic status output.
- Basic concurrency and quota handling.

Exit criteria:
- Users can operate multiple agents from terminal without dashboard dependency.

### Phase 4: Cross-OS Remote Connectivity

Deliverables:
- `windie remote` connect/list/ping/disconnect.
- Remote agent directory and policy-gated handoff.
- Threaded result return with artifact references.

Exit criteria:
- Trusted node-to-node handoff works with full audit and revocation path.

### Phase 5: Hardening + UX Parity

Deliverables:
- Retry/backoff tuning and error taxonomy.
- Better TTY UX (progress, concise mode, raw JSON mode).
- Performance profiling + reliability SLOs.

Exit criteria:
- Stable daily-driver CLI for local and remote workflows.

## Observability + Reliability

Required metrics:
- Command latency (`p50/p95/p99`) by command family.
- Command success/failure codes.
- UI action resolution confidence and miss rate.
- Remote handoff duration and timeout rate.
- Active session count, reconnect count, dropped stream count.

Reliability model:
- At-least-once transport with idempotency keys for mutable actions.
- Per-command timeout budgets with explicit retry classes.
- Dead-letter handling for failed remote handoffs.

## Test Strategy

1. Unit tests
- Command parser, flag normalization, output renderers, error mapping.

2. Integration tests
- CLI -> backend route contract tests.
- CLI -> local-runtime UI action tests (mock and live smoke mode).
- Remote connection handshake and policy rejection tests.

3. End-to-end tests
- Query stream from CLI through completion.
- UI action preview + approval + execution.
- Cross-OS handoff happy path + denial + timeout scenarios.

4. Regression guards
- Snapshot tests for JSON output schema.
- Contract tests for event envelopes and enum stability.

## Open Decisions

- CLI runtime language final choice (Python-first vs dedicated TS/Rust binary later).
- `windied` daemon mandatory vs optional.
- Remote connectivity transport baseline (broker-only vs broker + direct channels).
- Approval UX defaults for non-interactive scripts.
- Artifact retention policy for remote handoff results.

## Immediate Next Steps

1. Approve v1 command taxonomy and naming.
2. Draft `backend/contracts` message schemas for CLI envelopes.
3. Implement Phase 1 `windie query` with streaming + JSON mode.
4. Add Phase 1 docs:
   - CLI quick start
   - auth/session config
   - command error code reference
