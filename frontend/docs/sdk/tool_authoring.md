---
summary: "SDK tool authoring guide for backend tool template, ToolContext, schema contract, permissions, and runtime registration expectations."
read_when:
  - When adding SDK-authored backend tools.
  - When changing the backend SDK tool template or ToolContext contract.
title: "Tool Authoring"
---

# Tool Authoring

Hosted backend SDK tool authoring is separate from local runtime tool implementation. Use SDK tools for backend-owned capabilities; use local runtime tools for local machine control.

## Template

The backend tool template lives at:

- private backend implementation
- private backend implementation
- private backend implementation

## Core Contract

The SDK `Tool` base and `ToolContext` live under:

- private backend implementation
- private backend implementation

Tool implementations should define:

- stable name and description
- input schema
- required permissions when applicable
- clear success/error result shape
- artifact fields when returning screenshots or files

## Registration Expectations

Backend model-facing tool exposure still flows through backend registry/policy code. Do not assume a new SDK tool is model-visible until it is registered, policy-allowed, documented, and covered by tests.

## Deep Docs

- Backend SDK Tool Context + Schema Contract Reference (private backend docs)
- Backend SDK Sub-Agent Session Helper Runtime Reference (private backend docs)
- Backend Tools Templates Docs Hub (private backend docs)
