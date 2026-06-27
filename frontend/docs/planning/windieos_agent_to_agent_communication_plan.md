---
summary: "Implementation plan for policy-gated agent-to-agent communication in WindieOS multi-VM runtime."
read_when:
  - Designing collaboration between multiple WindieOS agents in one workspace.
  - Defining inter-agent message contracts, routing, and security boundaries.
  - Implementing task handoff, result return, and escalation between agents.
---

# WindieOS Agent-to-Agent Communication Plan

## Objective

Enable agents in the same workspace to communicate through a safe, auditable channel so they can coordinate work across VMs.

Target outcome:
- Agent A can request work from Agent B.
- Agent B can accept/reject, stream status, and return structured results.
- Humans can inspect, pause, and override collaboration flows.

## Scope

In scope:
- Inter-agent messaging model and protocol.
- Routing through control plane (no direct VM-to-VM trust).
- Policy gates for who can message whom and what can be shared.
- Task handoff lifecycle and state transitions.
- Observability, audit, limits, and rollout phases.

Out of scope (v1):
- Fully autonomous swarm behavior without policy constraints.
- Cross-workspace agent communication.
- Cross-tenant shared memory or broadcast mesh.

## Baseline and Constraints

From `docs/planning/windieos_vm_multi_agent_plan.md`:
- One active agent per VM.
- Control plane already owns lifecycle, policy, and audit concerns.
- Multi-agent runtime exists, but collaboration is currently policy-gated and undefined.

Design constraint:
- Agent communication must be brokered by control plane and attributable to authenticated workspace identity.

## Collaboration Model

### Default topology

Use hub-and-spoke:
- Agent workers connect to a control-plane Collaboration Broker.
- Broker validates policy, delivers messages, stores events, enforces quotas.
- No direct VM socket channels in v1.

### Interaction patterns

1. Task handoff (primary)
- A asks B to execute scoped work.
- B returns result/artifact pointer.

2. Clarification loop
- B asks A for missing context.
- A responds or cancels request.

3. Escalation
- Agent requests human decision for ambiguous/high-risk action.

4. Status broadcast (policy-limited)
- Optional workspace-level status events for dashboard visibility.

## Message Contract (v1)

Required envelope fields:
- `workspace_id`
- `thread_id` (collaboration thread)
- `message_id`
- `from_agent_id`
- `to_agent_id`
- `kind`
- `payload`
- `created_at`
- `ttl_seconds`
- `correlation_id` (for request/response linkage)

`kind` enum (v1):
- `task_request`
- `task_accept`
- `task_reject`
- `task_update`
- `task_result`
- `clarification_request`
- `clarification_response`
- `escalation_request`
- `cancel_request`
- `cancel_ack`

### Payload contracts

`task_request` payload:
- `task_type`
- `objective`
- `constraints`
- `input_refs` (artifact/message refs)
- `expected_output_schema`
- `priority`

`task_result` payload:
- `status` (`success|partial|failed|cancelled`)
- `summary`
- `output`
- `artifact_refs`
- `error` (optional, sanitized)

## Policy and Safety Gates

### Authorization

Broker checks before delivery:
- Agents belong to same `workspace_id`.
- Sender role allows target `task_type`.
- Current plan limits allow collaboration volume.

### Data sharing controls

- Default deny for raw clipboard/file blob transfer.
- Share by reference (`artifact_refs`) to controlled store.
- Sensitive payload classes require explicit policy flag.

### Allowed collaboration graph

Maintain workspace graph policy:
- `agent_id -> [allowed_target_agent_ids]`
- optional `allowed_task_types`

Default in v1:
- Explicit allowlist only.
- No wildcard “all agents can message all agents” by default.

### Human control requirements

- `escalation_request` must surface in UI.
- Human can: approve, deny, reroute, or terminate thread.
- Override action logged with actor identity and timestamp.

## Lifecycle and State Machine

Collaboration thread states:
- `open`
- `in_progress`
- `blocked`
- `awaiting_human`
- `completed`
- `failed`
- `cancelled`
- `expired`

Rules:
- `task_request` creates/enters `open`.
- `task_accept` -> `in_progress`.
- `escalation_request` -> `awaiting_human`.
- `task_result` terminalizes to `completed|failed|partial`.
- TTL expiry -> `expired` with cleanup event.

## API Surface (Control Plane)

Candidate APIs:
- `POST /api/agent-threads`
- `GET /api/agent-threads/{thread_id}`
- `POST /api/agent-threads/{thread_id}/messages`
- `POST /api/agent-threads/{thread_id}/cancel`
- `POST /api/agent-threads/{thread_id}/human-decision`
- `GET /api/agents/{agent_id}/inbox` (pull fallback)
- `GET /api/agents/{agent_id}/threads` (visibility)

Realtime channels:
- Broker push stream for inbox delivery and thread updates.
- Backpressure + ack/retry semantics.

## Reliability Model

Delivery semantics (v1):
- At-least-once delivery with dedupe by `message_id`.
- Per-thread ordering guarantee.
- Idempotent handler requirement on agent workers.

Timeouts:
- Request TTL enforced by broker.
- Per-kind default SLA:
  - `task_request` accept/reject deadline.
  - `clarification_request` response deadline.

Retry policy:
- Exponential retry for transient broker/worker disconnections.
- Dead-letter queue after retry exhaustion.

## Observability and Audit

Emit events for:
- Message accepted/rejected by policy.
- Delivery attempt/ack/failure.
- State transitions.
- Human intervention actions.

Required audit fields:
- `workspace_id`, `thread_id`, `message_id`
- sender/receiver agent IDs
- policy decision reason
- user actor for overrides

Dashboard needs:
- Active collaboration threads list.
- Thread timeline.
- Per-agent collaboration load + failure reasons.

## Security and Isolation

- Same tenant/workspace boundary as VM isolation model.
- Server-side identity source only.
- Payload size caps and schema validation on ingress.
- Redaction of secrets in logs/events.
- Broker rate limits to prevent message floods.

## Rollout Phases

### Phase 0: RFC + Threat Model

Deliverables:
- Message schema RFC.
- Threat model for spoofing, prompt-injection relays, data exfiltration.
- Policy model for allowed collaboration graph.

Exit criteria:
- Security sign-off.
- Contract freeze for v1 kinds.

### Phase 1: Single Thread Task Handoff (A -> B)

Deliverables:
- `task_request/accept/reject/result` flow.
- Broker storage + delivery + dedupe.
- Basic UI thread viewer.

Exit criteria:
- Reliable end-to-end handoff in staging.
- Complete audit trail for each handoff.

### Phase 2: Clarification + Escalation

Deliverables:
- `clarification_*` and `escalation_request` flows.
- Human decision API + UI controls.
- Timeout/cancel handling.

Exit criteria:
- Human override path tested under failure scenarios.
- No orphaned `awaiting_human` threads beyond SLA.

### Phase 3: Policy Hardening + Quotas

Deliverables:
- Collaboration allowlist graph management.
- Plan-aware quotas (threads/min, messages/min, payload budgets).
- Abuse detection and throttling.

Exit criteria:
- Load and abuse tests pass.
- Quota behavior and UX validated.

### Phase 4: Multi-Agent DAG Orchestration (Optional)

Deliverables:
- Parent/child thread links.
- Dependency-aware execution for multi-step distributed tasks.
- Aggregated result synthesis.

Exit criteria:
- Deterministic replay of orchestration traces.
- Failure isolation across branches.

## Testing Matrix

1. Functional
- A->B task handoff success/partial/failure.
- Clarification loop and return.

2. Reliability
- Broker restart mid-thread.
- Worker disconnect/reconnect with dedupe.

3. Security
- Cross-workspace spoof attempts.
- Unauthorized sender/receiver pair.
- Oversized/malformed payload rejection.

4. Human-in-loop
- Escalation decision paths (approve/deny/cancel/reroute).
- Timeout and stale escalation cleanup.

5. Scale
- 10/50/200 concurrent threads in one workspace.
- Quota and rate-limit enforcement.

## Open Decisions

1. Should threads be persisted in existing conversation store or separate collaboration store?
2. Should `task_update` allow free-form text or enum-based progress states only?
3. Should cross-model collaboration require explicit model-compatibility policy?
4. What minimum UI is required before enabling collaboration in beta?

## Definition of Done (Beta)

Feature is beta-ready when:
- Two agents in separate VMs can complete policy-approved handoff threads end-to-end.
- All collaboration events are auditable and attributable.
- Human can inspect and override active threads.
- Policy and quota enforcement prevent unauthorized or runaway communication.
