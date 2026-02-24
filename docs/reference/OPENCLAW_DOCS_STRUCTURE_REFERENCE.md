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
- `architecture/`
- `development/`
- `operations/`
- `planning/`
- `reference/`
- `browser/`

Added/expanded in this docs pass:

- `getting-started/DOCS_HUB.md`: central docs entrypoint.
- `backend/`: backend functionality maps and subsystem docs.
- `frontend/`: frontend/electron/renderer/sidecar functionality maps.
- Sub-hubs added for layered navigation:
- `backend/bootstrap/README.md`, `backend/api/README.md`, `backend/contracts/README.md`, `backend/tools/README.md`
- `frontend/main/README.md`, `frontend/renderer/README.md`, `frontend/contracts/README.md`, `frontend/sidecar/README.md`

## WindieOS Section Policy (Proposed)

- `getting-started/`: onboarding and quick paths.
- `architecture/`: high-level conceptual architecture and cross-system flows.
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
- Update hub/index pages when adding subsystem docs.
- Keep behavior docs synchronized with backend/frontend runtime changes.
