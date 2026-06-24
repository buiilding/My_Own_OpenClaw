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
| 10 | Electron main app diagnostics | `agent_definition.flow` | `sdk_builder.input` | Records sanitized builder input counts before SDK Agent definition construction. |
| 11 | Electron main app diagnostics | `agent_definition.flow` | `generated_definition.build` | Records generated definition counts for prompts, tools, skills, plugins, MCP, and repo layers. |
| 12 | Electron main app diagnostics | `agent_definition.flow` | `supplied_definition.detect` | Records whether the renderer or caller supplied additional Agent definition context. |
| 13 | Electron main app diagnostics | `agent_definition.flow` | `definition_merge.apply` | Records final merged definition counts after generated and supplied context are combined. |
| 14 | Electron main app diagnostics | `agent_definition.flow` | `payload_attachment.prepare` | Records that the query payload is ready to receive sanitized Agent definition context. |
| 15 | Electron main app diagnostics | `agent_definition.flow` | `payload_attachment.complete` | Records final Agent definition attachment before the payload leaves Electron main. |
| 16 | SDK durable turn trace | `agent_definition.sdk_flow` | `source_payload.snapshot` | Records source payload key count before resource and Agent definition enrichment. |
| 17 | SDK durable turn trace | `agent_definition.sdk_flow` | `resources.resolve` | Records resource payload and metadata key counts after turn resource resolution. |
| 18 | SDK durable turn trace | `agent_definition.sdk_flow` | `enrichment.apply` | Records enriched payload key count after memory/resource query enrichment. |
| 19 | SDK durable turn trace | `agent_definition.sdk_flow` | `sdk_definition.detect` | Records whether the SDK-level Agent definition contributed to the turn. |
| 20 | SDK durable turn trace | `agent_definition.sdk_flow` | `query_definition.detect` | Records whether query payload Agent definition context contributed to the turn. |
| 21 | SDK durable turn trace | `agent_definition.sdk_flow` | `definition_merge.apply` | Records merged Agent definition key and source counts before transport payload creation. |
| 22 | SDK durable turn trace | `agent_definition.sdk_flow` | `workspace_context.detect` | Records workspace context presence without storing workspace paths. |
| 23 | SDK durable turn trace | `agent_definition.sdk_flow` | `system_prompt.detect` | Records system-prompt override/default presence and prompt length only. |
| 24 | SDK durable turn trace | `agent_definition.sdk_flow` | `tools_manifest.detect` | Records merged client tool manifest counts without tool schema bodies. |
| 25 | SDK durable turn trace | `agent_definition.sdk_flow` | `disabled_tools.detect` | Records disabled tool counts from SDK, query, and merged Agent definition context. |
| 26 | SDK durable turn trace | `agent_definition.sdk_flow` | `enabled_remote_tools.detect` | Records enabled remote tool counts from SDK, query, and merged Agent definition context. |
| 27 | SDK durable turn trace | `agent_definition.sdk_flow` | `prompt_layers.detect` | Records prompt layer counts without prompt-layer contents. |
| 28 | SDK durable turn trace | `agent_definition.sdk_flow` | `agents_md.detect` | Records AGENTS.md layer counts without instruction contents or paths. |
| 29 | SDK durable turn trace | `agent_definition.sdk_flow` | `plugin_contributions.detect` | Records plugin contribution count from merged Agent definition context. |
| 30 | SDK durable turn trace | `agent_definition.sdk_flow` | `skill_contributions.detect` | Records skill contribution count from merged Agent definition context. |
| 31 | SDK durable turn trace | `agent_definition.sdk_flow` | `mcp_contributions.detect` | Records MCP server and manifest tool counts without MCP payloads or schemas. |
| 32 | SDK durable turn trace | `agent_definition.sdk_flow` | `capability_revision.detect` | Records capability revision ids for merged, SDK, and query definitions. |
| 33 | SDK durable turn trace | `agent_definition.sdk_flow` | `local_runtime.detect` | Records whether the SDK local runtime was available for the turn. |
| 34 | SDK durable turn trace | `agent_definition.sdk_flow` | `transport_payload.ready` | Records transport payload key count before backend dispatch. |
| 35 | SDK durable turn trace | `agent_definition.sdk_flow` | `backend_dispatch.handoff` | Records the sanitized handoff boundary immediately before backend send. |
| 36 | Backend durable stream trace | `agent_definition.backend_flow` | `query.receive` | Records that backend session processing received context-bearing query data. |
| 37 | Backend durable stream trace | `agent_definition.backend_flow` | `agent_definition.receive` | Records whether an Agent definition reached hosted session processing. |
| 38 | Backend durable stream trace | `agent_definition.backend_flow` | `runtime_context.resolve` | Records OS/workspace runtime context presence without local paths. |
| 39 | Backend durable stream trace | `agent_definition.backend_flow` | `system_prompt_override.resolve` | Records system-prompt override presence without prompt text. |
| 40 | Backend durable stream trace | `agent_definition.backend_flow` | `raw_client_manifest.read` | Records raw client manifest tool count before backend validation. |
| 41 | Backend durable stream trace | `agent_definition.backend_flow` | `client_tool_manifest.validate` | Records accepted and rejected client tool counts after validation. |
| 42 | Backend durable stream trace | `agent_definition.backend_flow` | `tool_policy.apply` | Records policy rebuild and allowed client tool counts after ToolPolicy filtering. |
| 43 | Backend durable stream trace | `agent_definition.backend_flow` | `prompt_layers.read` | Records raw prompt-layer count from the incoming Agent definition. |
| 44 | Backend durable stream trace | `agent_definition.backend_flow` | `prompt_layers.validate` | Records accepted and rejected prompt-layer counts after backend validation. |
