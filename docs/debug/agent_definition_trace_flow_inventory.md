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
| 2 | Electron main app diagnostics | `agent_definition.flow` | `custom_instructions.collect` | Records custom instruction presence and length without storing the prompt text. |
| 3 | Electron main app diagnostics | `agent_definition.flow` | `local_tool_policy.collect` | Records disabled local tool count from the live desktop UI config. |
| 4 | Electron main app diagnostics | `agent_definition.flow` | `remote_tool_policy.collect` | Records disabled remote tool count before remote tool availability is resolved. |
| 5 | Electron main app diagnostics | `agent_definition.flow` | `enabled_remote_tools.resolve` | Records the resulting enabled remote tool count after disabled remote policy is applied. |
| 6 | Electron main app diagnostics | `agent_definition.flow` | `workspace_path.collect` | Records workspace-path presence without persisting the local path. |
| 7 | Electron main app diagnostics | `agent_definition.flow` | `repo_instructions.resolve` | Records AGENTS.md layer count without storing repo instruction contents or paths. |
| 8 | Electron main app diagnostics | `agent_definition.flow` | `extension_prompt_layers.resolve` | Records extension prompt-layer count without prompt-layer content. |
| 9 | Electron main app diagnostics | `agent_definition.flow` | `host_os.resolve` | Records platform and host OS labels used for Agent definition runtime context. |
