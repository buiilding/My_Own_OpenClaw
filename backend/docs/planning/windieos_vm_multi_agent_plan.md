---
summary: "Implementation plan for multi-agent WindieOS execution on isolated virtual machines with user remote-control access per agent VM."
read_when:
  - Designing hosted VM workspaces for WindieOS agents.
  - Planning one-agent-per-VM orchestration and lifecycle APIs.
  - Defining secure remote-control and human override behavior.
---

# WindieOS VM Multi-Agent Plan

## Objective

Enable users to run multiple WindieOS agents in parallel, where each agent executes inside its own isolated virtual machine (VM), and allow the user to remotely control any VM directly.

Target outcome:
- User can create N agents.
- Each agent is bound to exactly one VM runtime.
- Agent can operate autonomously in its VM.
- User can open live remote control for any VM and take over/assist.

## Scope

In scope:
- VM lifecycle and orchestration model.
- Agent portability model ("port WindieOS agent into VM").
- Multi-agent control plane APIs.
- Remote-control session architecture.
- Security/isolation and audit requirements.
- Phased rollout with acceptance criteria.

Out of scope for initial rollout:
- Cross-cloud/multi-region active-active from day one.
- Full enterprise RBAC productization in V1.
- Agent-to-agent autonomous collaboration without explicit policy gates (see `docs/planning/windieos_agent_to_agent_communication_plan.md`).

## Baseline (Current Reality)

Current WindieOS is desktop-first:
- Agent orchestration is backend-centered.
- Tool execution is SDK/main local-runtime-centered (`frontend/src/main/python/*`).
- Remote tool schemas are backend-driven and mapped to SDK/main local-runtime implementations.

For VM execution, the key shift is:
- Move tool execution runtime from local user desktop sidecar into a VM-resident runtime.
- Keep a central control plane for scheduling, policy, billing, and telemetry.

## Target Architecture

### Planes

1. Control Plane (hosted backend services)
- Auth, entitlement checks, tenant policy.
- Agent/VM lifecycle APIs.
- Scheduler and queueing.
- Audit, metering, and artifact indexing.

2. VM Runtime Plane (per-agent workspace)
- One VM per active agent.
- VM runs WindieOS Runtime Agent Worker:
  - LLM/tool loop execution runtime.
  - VM-local tool executor (keyboard/mouse/browser/filesystem/shell within VM).
  - Telemetry and heartbeat agent.

3. Remote Control Plane
- Secure stream gateway for video frames + input relay.
- Session manager for user viewer/controller sessions.
- Arbitration logic between autonomous agent actions and user control.

### Core Entities

- `workspace_id`: logical container for one or more agent VMs.
- `agent_id`: user-visible agent identity.
- `vm_id`: concrete VM instance.
- `agent_vm_binding`: `agent_id -> vm_id` (1:1 during runtime).
- `control_session_id`: user remote-control session for a VM.

## Porting a WindieOS Agent into a VM

"Port agent" should be implemented as a versioned packaging and bootstrap workflow, not ad hoc file copying.

### Agent Bundle Specification

Create a signed `agent_bundle` artifact containing:
- Runtime version (`windie_runtime_version`).
- Tool catalog + policy profile.
- Model/provider config profile (no raw secrets embedded).
- Procedural memory/profile prompt fragments (if enabled).
- Startup entrypoint contract.

Recommended metadata:
- `bundle_version`
- `compat_matrix` (backend/runtime protocol versions)
- `tool_capabilities`
- `created_by_user_id`
- `created_at`

### Import/Bootstrap Flow

1. User requests new agent with VM.
2. Control plane picks base VM image.
3. VM boots cloud-init/bootstrap script.
4. Runtime worker pulls `agent_bundle`.
5. Worker validates signature + compatibility.
6. Worker registers heartbeat and tool capabilities with control plane.
7. Agent status becomes `ready`.

### Versioning Rules

- Backward compatibility window must be explicit (for example, last 2 runtime minor versions).
- On incompatibility: fail fast with actionable error and auto-suggest rebuild of bundle.
- No silent downgrade of policy/tool capabilities.

## Multi-Agent Orchestration Model

### Lifecycle State Machine

Agent states:
- `provisioning`
- `bootstrapping`
- `ready`
- `running`
- `paused`
- `error`
- `terminating`
- `terminated`

VM states:
- `creating`
- `starting`
- `healthy`
- `degraded`
- `stopped`
- `destroyed`

Required invariant:
- Agent enters `running` only if bound VM is `healthy` and heartbeat SLA is met.

### Scheduling and Capacity

- Default policy: one VM per active agent.
- Quotas by plan:
  - max concurrent VMs
  - max VM uptime hours
  - max remote-control minutes
- Autosuspend idle VMs with fast resume path.

### API Surface (Control Plane)

Add API families:

1. Agent + VM lifecycle
- `POST /api/workspaces/{workspace_id}/agents`
- `POST /api/agents/{agent_id}/start`
- `POST /api/agents/{agent_id}/pause`
- `POST /api/agents/{agent_id}/resume`
- `DELETE /api/agents/{agent_id}`

2. Bundle management
- `POST /api/agent-bundles`
- `POST /api/agents/{agent_id}/port-bundle`
- `GET /api/agent-bundles/{bundle_id}`

3. Remote control
- `POST /api/vms/{vm_id}/control-sessions`
- `DELETE /api/control-sessions/{control_session_id}`
- `GET /api/vms/{vm_id}/stream-token`

4. Observability
- `GET /api/agents/{agent_id}/events`
- `GET /api/vms/{vm_id}/health`

## Remote Control Design

### Session Capabilities

Remote control should support roles:
- `viewer`: read-only live view.
- `controller`: can send input events.

Input classes:
- mouse move/click/scroll
- keyboard input
- clipboard paste (policy-gated)
- file transfer (policy-gated)

### Human-Agent Arbitration

Define explicit control modes per VM:
- `agent_only`: user watches, no input.
- `shared_control`: user input allowed; agent slowed or focus-aware.
- `human_override`: agent execution paused while user controls VM.

Default recommendation for safety:
- Auto-switch to `human_override` when controller input starts.
- Resume agent only via explicit user action.

### UX Requirements

- VM card per agent with health, latency, current task.
- One-click “Open Remote Control”.
- Visible banner showing current control mode.
- “Resume Agent” and “Pause Agent” controls in remote console.

## Security and Isolation Requirements

### Isolation

- Strong tenant isolation at VM, network, storage, and metadata layers.
- No shared writable disk across tenant VMs.
- Per-VM ephemeral credentials with short TTL.

### Data Boundaries

- Clipboard/file transfer disabled by default.
- Policy-based allowlist for transfer directions.
- Secret redaction pipeline for logs/screenshots/artifacts.

### Identity and Ownership

- Server-issued identity only (do not trust client-supplied user identity).
- Every control session tied to authenticated user + workspace membership.
- Full audit log for:
  - agent actions
  - user remote inputs
  - mode changes (`agent_only`, `shared_control`, `human_override`)

### Network Policy

- Egress policy profiles per plan/workspace.
- Domain/IP allowlists for restricted agents.
- Explicit blocked categories for high-risk outbound traffic.

## Billing and Metering

Add new metered dimensions:
- VM runtime minutes.
- VM provisioning count.
- Remote-control active minutes.
- Data egress volume.

Enforcement:
- Soft limits with warnings.
- Hard limits that prevent new VM starts but do not abruptly kill active controlled sessions unless required by policy.

## Rollout Phases

### Phase 0: RFC and Threat Model

Deliverables:
- Architecture RFC for control plane + VM runtime + remote control planes.
- Threat model for tenant isolation, control hijack, and data exfiltration.
- Decision on VM substrate (for example Firecracker-based microVM vs full VM).

Exit criteria:
- Approved RFC.
- Security sign-off on minimum controls.

### Phase 1: Single Agent, Single VM MVP

Deliverables:
- Provision one VM for one agent.
- Bootstrap runtime worker from signed bundle.
- Run one autonomous task end-to-end.
- Expose basic health/heartbeat.

Exit criteria:
- Stable single-agent execution across repeated runs.
- Deterministic teardown and cleanup.

### Phase 2: Remote Control MVP

Deliverables:
- Live stream + input relay.
- `viewer` and `controller` roles.
- Human override mode integrated with agent pause/resume.

Exit criteria:
- User can take control of VM, perform actions, and return control to agent safely.
- Audit events emitted for all control transitions.

### Phase 3: Multi-Agent Parallel Runtime

Deliverables:
- Multiple agents per workspace, each with own VM.
- Queue/scheduler and quota enforcement.
- Dashboard listing all agent VMs and statuses.

Exit criteria:
- Parallel runs meet SLO for startup latency and task completion.
- One VM failure does not cascade to other agents.

### Phase 4: Hardening and Policy Controls

Deliverables:
- Egress policy profiles.
- Clipboard/file transfer policy controls.
- Billing-grade metering + limit behavior.
- Incident response runbooks.

Exit criteria:
- Security and compliance readiness gate passed for beta customers.

### Phase 5: Hybrid Local VM Option (Optional)

Deliverables:
- User-hosted local VM connector.
- Same control-plane APIs, different runtime provider.
- Clear support boundary and diagnostics tooling.

Exit criteria:
- Local VM path reaches functional parity for core lifecycle/control operations.

## Reliability and SLO Targets

Initial targets:
- VM provisioning success: >= 99%.
- VM ready time p95: <= 120s.
- Control-session connect success: >= 99.5%.
- Remote input round-trip p95: <= 250ms (regional baseline).

## Testing Matrix

1. Functional
- Create 1, 5, 20 agents in same workspace.
- Port bundle upgrade/downgrade compatibility checks.

2. Failure
- VM crash during active run.
- Network partition during control session.
- Control gateway restart.

3. Security
- Cross-tenant access attempt.
- Unauthorized input injection to control channel.
- Data leak checks across artifact/log stores.

4. Billing/limits
- Quota exhaustion behavior for VM count/minutes.
- Soft/hard limit UX and API responses.

## Dependencies on Existing Roadmap

This plan depends on and extends:
- `docs/planning/future_plan.md` (Windie-owned machine strategy).
- `docs/operations/deployment.md` (hosted disposable workspace track).
- `docs/operations/multi_user_runtime_hardening.md` (identity/session safety).
- `docs/planning/README.md`.

## Open Decisions

1. VM substrate choice and isolation-performance tradeoff.
2. Remote protocol stack (browser-native vs dedicated client protocol).
3. Agent worker placement model:
- fully in-VM loop, or
- split loop (control-plane orchestration + in-VM executor).
4. Snapshot/resume semantics for paused agents.
5. Pricing model for concurrent VMs and remote-control minutes.

## Definition of Done (First Public Beta)

WindieOS meets first beta bar when:
- A user can create multiple agents and each gets its own VM.
- Each agent executes tasks independently without cross-VM interference.
- User can open remote control on any VM, take over safely, and resume agent.
- Security, audit, and quota controls are active and validated in staging.
