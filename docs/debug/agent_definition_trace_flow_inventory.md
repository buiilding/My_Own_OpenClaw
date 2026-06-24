---
summary: "Inventory of the 50 Agent definition flow traces that follow system prompt and disabled-tool settings from Electron main through the SDK and backend."
read_when:
  - When debugging whether Agent settings reached backend prompt construction.
  - When tracing custom system prompts, disabled tools, prompt layers, repo instructions, or Agent definition handoff.
title: "Agent Definition Trace Flow Inventory"
---

# Agent Definition Trace Flow Inventory

This inventory maps the 50 sanitized traces that follow Agent settings from
Electron main into the SDK turn and backend session runtime. Rows are evidence
only: they store counts, booleans, key counts, enum-like stages, and revision
ids, never prompt text, AGENTS.md contents, tool schemas, tool arguments,
provider payloads, credentials, or local filesystem paths.

| # | Surface | Trace | Stage | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Electron main app diagnostics | `agent_definition.flow` | `desktop_config.snapshot` | Captures whether the live desktop UI config existed before query-time Agent definition assembly. |
