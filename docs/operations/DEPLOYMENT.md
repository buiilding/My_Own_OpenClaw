---
summary: "Deployment & Packaging Plan"
read_when:
  - When shipping desktop builds.
  - When planning hosted infrastructure.
  - When rolling out multi-user support.
---

# Deployment & Packaging Plan

## Scope

This document is the practical plan for:
- Packaging WindieOS desktop apps.
- Deploying backend services.
- Scaling from single-user local mode to multi-user hosted mode.

For feature roadmap details, see `../product/FUTURE_PLAN.md`.

## Target Modes

### Mode A: Local-only (current baseline)
- Electron app + local Python sidecar + local backend.
- Best privacy posture.
- No cloud account required.

### Mode B: Hybrid
- Desktop app remains local.
- Hosted API for auth/billing/model routing.
- Optional hosted OCR/vision for heavy workloads.

### Mode C: Hosted-first
- Desktop app is the client.
- Agent execution, memory, and model serving mostly remote.
- Local-only still available as an explicit privacy mode.

## Desktop Packaging Plan

### Artifacts
- Windows: NSIS installer.
- macOS: `dmg` + `zip`.
- Linux: AppImage + deb + rpm.

Current repo packaging entrypoints (run from `frontend/`):
- `npm run package:win`
- `npm run package:mac`
- `npm run package:linux`

Bundled sidecar-runtime packaging profile:
- `npm run package:win:bundled-python`
- `npm run package:mac:bundled-python`
- `npm run package:linux:bundled-python`
- runtime build guide: `docs/operations/SIDECAR_RUNTIME_PACKAGING.md`

### Signing & update channels
- Signing required before production rollout (macOS notarization, Windows signing).
- Channels: `canary`, `beta`, `stable`.
- Rollout: staged rollout by percentage; instant rollback by channel pin.

### CI/CD release flow
1. Build matrix (win/mac/linux).
2. Smoke test launch + IPC sanity.
3. Sign artifacts.
4. Publish release metadata.
5. Enable auto-update by channel.

### Packaging references
- Electron built-in updater supports macOS/Windows only: `https://www.electronjs.org/docs/latest/api/auto-updater`
- `electron-updater` supports Linux targets and staged rollouts: `https://www.electron.build/auto-update.html`

## Hosted Server Topology (Phase Target)

```
Desktop App
   |
   | HTTPS / WSS
   v
API Gateway / Edge
   |-- Auth service (OIDC)
   |-- Session service
   |-- Rate limit + usage meter
   v
Agent Router
   |-- Chat workers
   |-- Tool orchestration workers
   |-- OCR/Vision serving pool
   v
Data Plane
   |-- Postgres (users, orgs, entitlements, usage)
   |-- Redis (sessions, queues, rate limits)
   |-- Object storage (screenshots, artifacts, logs)
   |-- Vector store (tenant memory indexes)
```

## Multi-User Deployment Plan

### Tenant model
- Tenant hierarchy: `org -> user -> device -> session`.
- Every request carries `tenant_id` + `user_id` (server-validated, never trusted from client alone).
- Storage partitioning by tenant for memory, artifacts, and logs.

### Session model
- Sticky websocket sessions at the edge.
- Session router dispatches to worker pool.
- Stateless workers; state in Redis/Postgres/object store.

### Quotas and concurrency
- Enforce by plan: concurrent sessions, tool calls, screenshot volume, token budget.
- Soft-limit warning + hard-limit stop.

## OCR & Vision Dynamic Scaling Plan

### Why
Current in-process OCR/vision path is great for single-user local mode, but hosted multi-user requires elastic serving.

### Serving design (hosted)
- Inference gateway in front of OCR and grounding workers.
- First-class queueing to absorb bursts.
- Per-tenant admission control (avoid noisy-neighbor failures).
- Separate pools:
  - OCR pool (CPU-first, optional GPU).
  - Vision grounding pool (GPU-first).

### Candidate stacks to evaluate
- Kubernetes HPA baseline: `https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/`
- Event-driven scaling with KEDA: `https://keda.sh/`
- KServe autoscaling for LLM/VLM workloads: `https://kserve.github.io/website/docs/model-serving/generative-inference/autoscaling`
- vLLM OpenAI-compatible serving: `https://docs.vllm.ai/en/stable/serving/openai_compatible_server/`
- Triton for dynamic batching/concurrent model execution: `https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/batcher.html`

### Rollout sequence
1. Keep local inference default.
2. Add hosted OCR endpoint with fallback to local sidecar.
3. Add hosted vision endpoint + rate limiting.
4. Add autoscaling based on queue depth + latency SLO.
5. Add per-tier dedicated capacity options.

## Remote Execution Environment Strategy

This affects “Windie controls its own machine” features.

### Option 1: User-hosted local VM
- Pros: data locality, offline-friendly.
- Cons: OS variability, GPU availability, support burden.

### Option 2: Hosted disposable workspace (recommended first)
- Pros: standardized environment, easier isolation/policy, easier fleet scaling.
- Cons: network latency, higher infra cost, trust/compliance requirements.

### Option 3: Hybrid
- Default hosted workspace.
- Local VM optional for privacy/power users.

### Existing platform references
- RustDesk self-hosting: `https://rustdesk.com/docs/en/`
- Apache Guacamole browser-based remote desktop: `https://guacamole.apache.org/doc/1.5.4/gug/using-guacamole.html`
- Amazon WorkSpaces Secure Browser (disposable hosted browser): `https://docs.aws.amazon.com/workspaces-web/latest/adminguide/what-is-workspaces-secure-browser.html`
- Cloudflare remote browser isolation: `https://developers.cloudflare.com/cloudflare-one/policies/browser-isolation/`
- Firecracker microVM project: `https://github.com/firecracker-microvm/firecracker`

## Security & Identity Baseline for Hosted Mode

### Identity
- OAuth2 + OIDC for login/session identity.
- Prefer Authorization Code + PKCE for desktop.

### Auth standards references
- OAuth 2.0 (RFC 6749): `https://www.rfc-editor.org/rfc/rfc6749`
- OpenID Connect Core: `https://openid.net/specs/openid-connect-core-1_0-18.html`
- WebAuthn (passkeys): `https://www.w3.org/news/2026/w3c-invites-implementations-of-web-authentication-an-api-for-accessing-public-key-credentials-level-3/`

### API/schema reliability
- OpenAPI 3.1 + JSON Schema 2020-12 for tool schemas and contract validation.
- Schema version pinning + compatibility matrix for tool updates.

References:
- OpenAPI 3.1 spec: `https://spec.openapis.org/oas/v3.1.0.html`
- JSON Schema 2020-12: `https://json-schema.org/draft/2020-12`

## Observability & Operations

- Instrument all services with OpenTelemetry.
- Required dashboards: latency, queue depth, worker saturation, tool failure rate, per-tenant error rate, cost per request.
- Incident posture: rollback path for model/provider regressions.

Reference:
- OpenTelemetry docs: `https://opentelemetry.io/docs/`

## Phase Plan (Suggested)

### Phase 0 (0-4 weeks): Release foundation
- CI packaging matrix.
- Signed artifacts + update channels.
- Basic release runbook.

### Phase 1 (1-2 months): Hosted control plane
- Login/signup + session service.
- Plan entitlements + usage metering.
- Gateway + tenant-aware routing.

### Phase 2 (2-4 months): Multi-user execution
- Worker pools + queueing.
- Hosted OCR first.
- Billing-enforced quotas.

### Phase 3 (4-6 months): GPU serving scale
- Hosted vision grounding pool.
- KEDA/KServe autoscaling.
- SLO-based capacity tuning.

### Phase 4 (6+ months): Remote workspace track
- MVP hosted disposable workspace.
- Policy controls for copy/paste/file transfer.
- Evaluate local VM add-on mode.

## Open Decisions

- Default hosted provider footprint (single cloud vs multi-cloud).
- Whether OCR is always hosted in paid tiers.
- Whether remote workspace is browser-isolated only, full desktop, or both.
- Which enterprise controls are required for first B2B launch.
