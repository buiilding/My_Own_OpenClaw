---
summary: "Future Product Plan"
read_when:
  - When planning roadmap and sequencing.
  - When evaluating high-risk future capabilities.
---

# Future Product Plan

## Purpose

Convert strategic ideas into shippable, sequenced tracks.
This plan is conceptual and intentionally non-final.

## Guiding Principles

- Keep local-only mode first-class.
- Add hosted capabilities without breaking local workflows.
- Ship high-risk capabilities behind explicit policy + approvals.
- Prefer reversible architecture decisions in early phases.

## Roadmap Tracks
### 3) Windie Improves Its Own Frontend (Controlled Self-Evolution)

### Goal
Allow agent-proposed frontend improvements without unsafe autonomous code changes.

### Plan
- New workflow: `proposal -> diff -> tests -> human approval -> apply`.
- Agent can generate patch proposals and UI change rationale.
- CI gate required before merge/apply.
- Record all accepted/rejected proposals as memory for policy tuning.

### Guardrails
- No direct self-edit on protected files (`auth`, billing, security policy, updater).
- Mandatory code-owner review for runtime/security files.

### 4) Agent Interacts with Its Own UI (including `skills.md` flow)

### Goal
Dogfood UI automation and allow in-product maintenance actions.

### Plan
- Add an internal UI tool namespace (ex: `ui.click`, `ui.type`, `ui.navigate`).
- Start with safe views only (skills/settings panels).
- Add “self-interaction mode” banner + audit trail.
- Allow guided `skills.md` creation flow from UI with explicit user confirmation.

### Risks
- Recursive automation loops.
- Confusing ownership between user actions and agent actions.

### Mitigations
- Timeboxed UI sessions.
- Kill switch and replay log.

### 5) Automatic Remote Tool Schema Update in Backend

### Goal
Keep backend tool schemas synchronized with sidecar/remote tools automatically.

### Plan
- Publish a signed schema manifest (`version`, `compatibility`, checksum).
- Backend fetches schema manifest on startup and periodic refresh.
- Enforce compatibility checks before accepting new schema versions.
- Fallback to last-known-good schema set on failure.

### Contract standards
- OpenAPI + JSON Schema with strict semantic versioning.

### 6) Login / Signup / Landing Page

### Goal
Move from developer app to product onboarding funnel.

### Plan
- Add landing page with value prop, trust/privacy message, pricing CTA.
- Add desktop auth flow (OIDC Authorization Code + PKCE).
- Add account bootstrap: workspace creation, default policy, starter tutorial.
- Add billing handoff and trial logic after signup.

### Milestones
- M1: landing page + waitlist.
- M2: login/signup + session persistence.
- M3: subscription-aware feature gating.

### 7) Natural-Language Self-Configuration for User Preferences

### Goal
Let users change common behavior (speech replies, screenshot attach, voice mode) by saying it directly, without opening Settings.

### Plan
- Add a safe config-intent resolver on user text before normal query send.
- Restrict edits to existing renderer-managed allowlisted fields.
- Reuse the current persistence/sync path (`updateConfig` -> localStorage + disk + `update-settings`).
- Return explicit confirmation messages for each applied preference change.
- Add rollback command support for recent changes.

### Milestones
- M1: deterministic phrase resolver for high-confidence commands.
- M2: shared dashboard + chat-pill + voice-transcript behavior parity.
- M3: optional structured tool path for broader language with strict schema validation.

Implementation details tracked in:
- `docs/planning/windieos_self_edit_config_plan.md`

### 7) Student Chat Mode UX

### Goal
Fast “start learning now” flow.

### Plan
- On first run, open dashboard guidance immediately.
- In chat mode, capture initial screenshot automatically.
- Show contextual “what Windie sees” panel for transparency.
- Add simple curriculum widgets for common student tasks.

### Success metrics
- Time-to-first-successful-task.
- Drop-off before first tool call.

### 8) Windie-Owned Machine Strategy

### Goal
Give agent a dedicated execution environment without unsafe access.

### Options
- A) Local VM on user machine.
- B) Hosted disposable workspace (remote controlled).
- C) Hybrid (hosted default + local option).

### Recommendation
Start with B (hosted disposable workspace), then evaluate C.
Reason: easier standardization, stronger policy enforcement, better enterprise support.

### Security concerns to solve first
- Clipboard and file-transfer boundaries.
- Secret leakage from remote sessions.
- Tenant isolation and workspace teardown guarantees.

### 9) “Agent OS” Research Track

### Goal
Explore a minimal OS/runtime designed for agent execution.

### Concept
- Immutable base image.
- Policy-enforced tool runtime.
- Built-in observability and remote control APIs.
- Fast snapshot/restore for reproducible agent jobs.

### Stage gates
- G1: RFC + threat model.
- G2: prototype image + one real workflow.
- G3: performance/cost benchmark vs hosted workspace baseline.

## Cross-Track Dependencies

- Login/signup precedes hosted billing and multi-user controls.
- Schema auto-update precedes rapid tool ecosystem growth.
- Prompt policy split should land before broad student rollout.
- Hosted workspace should launch after tenant isolation + audit maturity.

## 90/180/365-Day Suggested Sequence

### 0-90 days
- Packaging pipeline and release channels.
- Landing page + auth foundation.
- Prompt profile split.
- Schema manifest design.

### 90-180 days
- Hosted OCR/vision first production slice.
- Student chat mode onboarding.
- UI self-interaction safe subset.
- Usage limits + billing-grade metering.

### 180-365 days
- Hosted disposable workspace MVP.
- Self-evolution workflow with strict approvals.
- Enterprise controls (SSO/RBAC/audit exports).
- Agent OS RFC/prototype decision.

## Decision Log Needed (create ADRs)

- Runtime choice for hosted workspace.
- Schema distribution trust model.
- Minimum controls before self-evolving frontend is enabled.
- Local VM support policy and support boundaries.

## External Research Targets

- KServe generative inference autoscaling: `https://kserve.github.io/website/docs/model-serving/generative-inference/autoscaling`
- KEDA event-driven autoscaling: `https://keda.sh/`
- vLLM serving: `https://docs.vllm.ai/en/stable/serving/openai_compatible_server/`
- NVIDIA Triton dynamic batching: `https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/batcher.html`
- OAuth2 / OIDC: `https://www.rfc-editor.org/rfc/rfc6749`, `https://openid.net/specs/openid-connect-core-1_0-18.html`
- WebAuthn / passkeys: `https://www.w3.org/news/2026/w3c-invites-implementations-of-web-authentication-an-api-for-accessing-public-key-credentials-level-3/`
- Remote execution options: `https://rustdesk.com/docs/en/`, `https://guacamole.apache.org/doc/1.5.4/gug/using-guacamole.html`, `https://docs.aws.amazon.com/workspaces-web/latest/adminguide/what-is-workspaces-secure-browser.html`, `https://developers.cloudflare.com/cloudflare-one/policies/browser-isolation/`, `https://github.com/firecracker-microvm/firecracker`
- Packaging/updater: `https://www.electronjs.org/docs/latest/api/auto-updater`, `https://www.electron.build/auto-update.html`
