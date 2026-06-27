---
summary: "First-class agent definition contract and SDK `buildAgentDefinition` builder for clients that initialize hosted agents without the Electron desktop app, including capability metadata stamping, Electron `electron_agent_definition_inputs.cjs` handoff, the current replacement for the old planned post-handshake client tool-schema sync, and the removed top-level `client_tool_manifest` handshake fallback."
read_when:
  - When building a custom UI, TUI, CLI, or hosted client.
  - When changing websocket handshake, prompt layers, client tool manifests, skills, AGENTS.md forwarding, or plugin metadata.
  - When changing `packages/windie-sdk-js/src/runtime/AgentDefinition.ts`, the SDK `buildAgentDefinition` export, capability metadata stamping, or Electron main's `electron_agent_definition_inputs.cjs` handoff into the SDK builder.
  - When searching for planned post-handshake client tool schemas, removed top-level `client_tool_manifest` handshake fallback behavior, agent capability handshake behavior, the removed `agent_capability_handshake.cjs` builder, or the removed `AgentCapabilityHandshake.test.cjs`.
---

# Agent Definition Contract

`agent_definition` is the client-owned contract for defining an agent before a
turn runs. Electron uses the same object that a custom UI, TUI, CLI, or SDK
client can send to the hosted backend.

The TypeScript SDK owns the data-only builder and capability metadata stamping
in `packages/windie-sdk-js/src/runtime/AgentDefinition.ts`. Electron main only
collects host-local inputs such as extension prompt layers, AGENTS.md content,
workspace path, and operating-system facts before calling the SDK builder.
For query-level payloads, Electron routes that collection and generated/supplied
definition merge through `frontend/src/main/ipc/ipc_agent_definition_context.cjs`.
Electron main reads renderer-managed Agent prompt and tool-policy inputs from
the redacted desktop UI config store immediately before attaching query-level
context, so just-edited settings do not depend on disk write timing.
SDK and Electron builder inputs use the public camelCase `agentsMd` option;
the snake_case `agents_md` spelling is only the generated backend wire field
inside the final `agent_definition` object.
When callers omit a display name, `buildAgentDefinition(...)` uses the generic
`Agent` default so SDK-authored agent definitions do not embed WindieOS product
copy or host-runtime assumptions outside host skin/config boundaries.
The Python SDK mirrors that boundary with generic generated identities:
`python-agent-*` ids, `Python Agent` display names, and `conv-python-agent`
conversation defaults when callers omit those values.

If `agent_definition` is omitted, the hosted backend uses its default agent:
the default backend prompt, built-in tools, backend policy, and normal provider
projection.
The backend wire value for that generated default is the generic `default` mode;
the removed `windie_default` input value is rejected instead of normalized. SDK
and host code should use `isDefaultAgentDefinition(...)` instead of checking the
literal directly.

## Websocket Handshake

Send `agent_definition` in the first `/ws` message:

```json
{
  "type": "handshake",
  "user_id": "user-123",
  "agent_definition": {
    "version": 1,
    "id": "my-agent",
    "name": "My Agent",
    "mode": "default_plus_overrides",
    "system_prompt": {
      "mode": "replace",
      "content": "You are a focused desktop operator."
    },
    "tools": {
      "mode": "client_only",
      "client_manifest": {
        "version": 1,
        "tools": []
      },
      "enabled_remote_tools": ["web_search"],
      "disabled_tools": []
    },
    "prompt_layers": [],
    "skills": [],
    "agents_md": [],
    "plugins": [],
    "runtime": {
      "operating_system": "macOS",
      "workspace_path": "/Users/me/project"
    }
  }
}
```

The same object may also be included on a `query` payload for clients that need
to update agent context for a specific turn. Query-level updates may omit
`tools.client_manifest`; when omitted, the backend preserves the tool manifest
accepted during handshake. Clients that need query-local tool policy to replace
or clear local tools must send `tools.client_manifest` on the query. An empty
manifest such as `{ "version": 1, "tools": [] }` is a real replacement when the
query also carries explicit tool policy, for example `tools.mode`,
`available_tools`, `enabled_remote_tools`, or `disabled_tools`.

## No Post-Handshake Tool Schema Sync

Current SDK/Electron clients do not send a separate post-handshake client
tool-schema message. The old planned post-handshake client tool schema sync is
owned by `agent_definition.tools.client_manifest` on the websocket
handshake.

## No Top-Level Client Tool Manifest Fallback

The websocket handshake no longer accepts a top-level `client_tool_manifest`
field. Client-local tool schemas must be nested under
`agent_definition.tools.client_manifest`; otherwise backend manifest validation
receives no client manifest for that handshake.

## Removed Agent Capability Handshake Builder

The old Electron-side agent capability handshake builder and
`AgentCapabilityHandshake.test.cjs` were deleted.
Client capability metadata now comes from the SDK-authored agent definition and
its client tool manifest, not a parallel main-process handshake helper. Add or
debug handshake behavior through `agent_definition.tools.client_manifest`,
`packages/windie-sdk-js/src/runtime/AgentDefinition.ts`,
`packages/windie-sdk-js/src/runtime/AgentClient.ts`, current
`tests/frontend/AgentSdkClient.test.ts` coverage, and the backend agent
definition validation path.

## Fields

| Field | Purpose |
| --- | --- |
| `system_prompt` | Uses backend default prompt with `mode: "default"` or replaces it with client text using `mode: "replace"`. Backend still prepends runtime OS/workspace context to both default and replaced prompts. |
| `tools.client_manifest` | Client-owned local tool schemas. The backend validates shape and limits, then exposes accepted tools. |
| `tools.mode` | Backend wire-policy detail. SDK clients normally author `builtins`, custom `tools`, `mcps`, `plugins`, and `skills` instead of setting this directly. |
| `prompt_layers` | General client instructions compiled after the system prompt. |
| `skills` | Skill instruction packs already resolved by the client into content. Skills are not executable tools. |
| `agents_md` | AGENTS.md or repo instruction content already resolved by the client. Hosted backend must not assume local filesystem access. |
| `plugins` | Plugin metadata and plugin prompt layers. Plugin executable tools still belong in `tools.client_manifest`. |
| `runtime` | OS and workspace facts that affect prompt rendering and tool policy. The TypeScript SDK infers `workspace_path` from the caller runtime when omitted. Backend provider health and policy own OCR, vision, prediction, web search, and paid capability availability. |

## Tool Modes

- `default`: use backend default tools.
- `default_plus_client`: use default tools plus accepted client tools.
- `client_only`: expose accepted client tools and explicitly enabled remote tools.
- `explicit`: expose `available_tools` plus accepted client tools and explicitly
  enabled remote tools.

For SDK-authored agents, omitted `builtins`, `tools`, `mcps`, and `plugins`
mean no tool schemas. The SDK maps this to `client_only` with an empty client
manifest. Use `builtins: "default"` or an explicit built-in group list such as
`builtins: ["filesystem", "shell"]` to expose built-in local-runtime tool
groups.

## Prompt Sources

Clients should resolve local content before sending it:

- read `AGENTS.md` locally and send entries in `agents_md`
- read extension `skills/*/SKILL.md` locally and send entries in `skills`
- read extension/plugin prompt files locally and send entries in `prompt_layers`
- send executable tool schemas through `tools.client_manifest`

This keeps the hosted backend usable by non-Electron clients without giving
the backend access to local paths.

## SDK Debug Routes

`/api/sdk/prompt-preview` and `/api/sdk/query-plan` accept the same
`agent_definition` object. Use those routes to inspect the compiled system
prompt, prompt messages, and model-visible tool schemas before running a turn.
