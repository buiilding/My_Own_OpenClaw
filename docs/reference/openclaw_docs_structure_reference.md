---
summary: "Reference map of OpenClaw documentation structure and how WindieOS mirrors it."
read_when:
  - When reorganizing WindieOS docs for consistency and discoverability.
  - When adding new docs sections and choosing where they belong.
title: "OpenClaw Docs Structure Reference"
---

# OpenClaw Docs Structure Reference

This document captures the OpenClaw docs organization that WindieOS should emulate for consistency, discoverability, and scalability.

## OpenClaw Docs Structure (Observed)

OpenClaw `docs/` is organized as domain hubs plus deep leaf docs. Major sections:

- `start/`: onboarding, quickstart, hubs, wizard, docs directory
- `concepts/`: architecture, sessions, context, memory, model failover, multi-agent
- `gateway/`: runtime runbook, protocol, security, auth, health, troubleshooting
- `tools/`: tool inventory, behavior, policies, approvals, browser, skills, subagents
- `channels/`: channel-by-channel setup and routing behavior
- `providers/`: model/provider integration docs
- `cli/`: command-level docs by subcommand
- `nodes/`: mobile/edge node features and troubleshooting
- `web/`: web dashboard and webchat surfaces
- `automation/`: cron/webhooks/hooks workflows
- `install/`: platform and hosting installation variants
- `platforms/`: OS-specific runtime notes
- `reference/`: release, templates, protocol references
- `security/` and `help/`: focused operational concerns
- `plugins/`: extension/plugin-specific docs
- `docs.json`: explicit docs IA and nav configuration

Representative style examples reviewed:

- `openclaw/docs/start/docs-directory.md`
- `openclaw/docs/concepts/architecture.md`
- `openclaw/docs/tools/index.md`
- `openclaw/docs/gateway/index.md`

## Patterns Worth Mirroring

- Domain-first hierarchy with explicit hubs.
- Runbook pages for operational areas.
- Separation of "concept" docs vs implementation/reference docs.
- Tooling documented as first-class system, not scattered notes.
- Explicit "read_when" guidance in front matter.
- Strong cross-linking between overview pages and deep pages.

## WindieOS Mapping

Current WindieOS major sections:

- `getting-started/`
- `concepts/`
- `desktop/`
- `debug/`
- `architecture/`
- `memory/`
- `tools/`
- `providers/`
- `sdk/`
- `install/`
- `cli/`
- `platforms/`
- `help/`
- `web/`
- `development/`
- `operations/`
- `planning/`
- `reference/`
- `browser/`

Added/expanded in WindieOS:

- `getting-started/docs_hub.md`: central agent-facing docs entrypoint with subsystem ownership, code-root routing, and change-path playbooks.
- `concepts/`: OpenClaw-style conceptual docs for runtime model, agent loop, context/memory, and safety boundaries.
- `gateway/`: hosted backend ingress docs for FastAPI app assembly, websocket/REST protocol families, install auth, health checks, and hosted troubleshooting.
- `desktop/`: user-visible desktop surface docs for dashboard, chat pill, response overlay, onboarding/permissions, voice, and artifacts.
- `debug/`: OpenClaw-style debug docs for logs, trace flags, symptom playbooks, and test selection.
- `channels/`: OpenClaw-style channel docs for desktop chat, websocket transport, voice/audio, sidecar tool execution, SDK clients, and VM run control routing.
- `security/`: top-level security docs for hosted auth, IPC isolation, validation, credentials, permissions, tool authority, sidecar execution, and multi-user risks.
- `plugins/`: current plugin-like extension docs for tools, providers, SDK routes, sidecar actions, renderer features, and future plugin-system boundaries.
- `browser/`: dedicated browser automation docs for launch/profile isolation, action dispatch, session UI, files, and troubleshooting.
- `memory/`: transcript, replay, sidecar local memory, backend history, semantic routes, and troubleshooting docs.
- `tools/`: first-class tool-system docs covering contracts, catalog matrices, execution lifecycle, policy/profile gates, troubleshooting, computer use, browser automation, filesystem, and shell execution.
- `providers/`: model/provider docs covering LLM providers, provider-specific runtime pages, model catalog metadata, credentials, and inference providers.
- `sdk/`: hosted backend client and developer API docs covering query planning, traces, OCR/vision, and tool authoring.
- `install/`, `cli/`, `platforms/`, `help/`, and `web/`: broad operational entrypoints that mirror OpenClaw's public-domain navigation while staying grounded in WindieOS desktop/runtime surfaces.
- `automation/`: current VM run orchestration docs for `/api/runs/*`, worker polling, run timelines, run controls, and explicit boundaries for future cron/webhook/scheduler work.
- `operations/`: OpenClaw-style operational hub and runbooks for runtime config ownership, hosted install auth, deployment, Cloudflare Tunnel, packaging/reinstall flows, release, security, performance, and troubleshooting.
- `backend/`: backend functionality maps and subsystem docs.
- `frontend/`: frontend/electron/renderer/sidecar functionality maps.
- `development/`: agent-facing implementation workflow, validation matrix, environment setup, testing, contributing, and tool-development guides.
- Sub-hubs added for layered navigation:
- `backend/bootstrap/README.md`, `backend/api/README.md`, `backend/contracts/README.md`, `backend/tools/README.md`
- `frontend/main/README.md`, `frontend/renderer/README.md`, `frontend/contracts/README.md`, `frontend/sidecar/README.md`
- Inventory and playbook references that route common implementation tasks to exact files:
- `backend/inventory/domains/backend_change_path_playbook_reference.md`
- `frontend/inventory/domains/frontend_change_path_playbook_reference.md`
- `backend/inventory/backend_capability_to_file_matrix_reference.md`
- `frontend/inventory/frontend_capability_to_file_matrix_reference.md`

## WindieOS Section Policy (Proposed)

- `getting-started/`: onboarding and quick paths.
- `concepts/`: product/system mental models that are not tied to one source folder.
- `gateway/`: hosted backend ingress, app assembly, auth, health, edge, and protocol runbooks.
- `desktop/`: user-facing desktop surfaces and their renderer/main ownership boundaries.
- `debug/`: symptom-first debugging, runtime trace controls, logs, and validation choices.
- `channels/`: entry-channel and transport routing docs across IPC, websocket, HTTP, sidecar JSON-RPC, SDK, voice, and VM run control.
- `security/`: security and trust-boundary routing docs; operations keeps deployment runbooks while this section maps enforcement owners.
- `plugins/`: current source-owned extension surfaces and explicit future boundaries for marketplace/dynamic plugin work.
- `browser/`: browser-specific runtime, action surface, and troubleshooting docs separate from generic tool docs.
- `memory/`: memory and transcript docs that distinguish renderer persistence, sidecar storage, and backend active history.
- `automation/`: current VM runs and worker control plane; future cron/webhook/durable scheduler docs stay in `planning/` until implemented.
- `architecture/`: high-level conceptual architecture and cross-system flows.
- `tools/`: first-class tool behavior, contracts, and runtime maps.
- `providers/`: LLM, model, credential, inference, audio, and web-search provider behavior.
- `sdk/`: hosted backend clients, public SDK routes, query introspection, and tool authoring.
- `install/`: source setup, packaged app build, and reinstall flows.
- `cli/`: current repo scripts/package commands and future first-class CLI boundary.
- `platforms/`: OS-specific desktop behavior and packaging notes.
- `help/`: diagnostics and troubleshooting.
- `web/`: hosted API, websocket, SDK, artifact, and landing-page web surfaces.
- `backend/`: implementation-level backend details (API, runtime, tools, config, services).
- `frontend/`: implementation-level renderer/main/sidecar details.
- `development/`: contributor workflows, testing, and local environments.
- `operations/`: runtime hardening, deployment, release, security, performance.
- `reference/`: stable interfaces and lookup docs.
- `planning/`: roadmap and future-state proposals.

## Doc Authoring Checklist (Adopted)

- Add `summary`, `read_when`, and `title` front matter.
- Keep overview pages as hubs, with deep technical pages linked below.
- Keep module/file references precise and current.
- Prefer task-oriented routing over giant exhaustive link dumps on top-level hubs.
- Update hub/index pages when adding subsystem docs.
- Keep behavior docs synchronized with backend/frontend runtime changes.
