---
summary: "First-class agent definition contract for clients that initialize WindieOS agents without the Electron frontend."
read_when:
  - When building a custom WindieOS UI, TUI, CLI, or hosted client.
  - When changing websocket handshake, prompt layers, client tool manifests, skills, AGENTS.md forwarding, or plugin metadata.
---

# Agent Definition Contract

`agent_definition` is the client-owned contract for defining an agent before a
turn runs. Electron uses the same object that a custom UI, TUI, CLI, or SDK
client can send to the hosted backend.

If `agent_definition` is omitted, the backend uses the default WindieOS agent:
the default backend prompt, built-in tools, backend policy, and normal provider
projection.

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
      "mode": "default_plus_client",
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
      "workspace_path": "/Users/me/project",
      "coordinate_methods": ["manual", "ocr"]
    }
  }
}
```

The same object may also be included on a `query` payload for clients that need
to update agent context for a specific turn.

## Fields

| Field | Purpose |
| --- | --- |
| `system_prompt` | Uses backend default prompt with `mode: "default"` or replaces it with client text using `mode: "replace"`. |
| `tools.client_manifest` | Client-owned local tool schemas. The backend validates shape and limits, then exposes accepted tools. |
| `tools.mode` | `default`, `default_plus_client`, `client_only`, or `explicit`. |
| `prompt_layers` | General client instructions compiled after the system prompt. |
| `skills` | Skill instruction packs already resolved by the client into content. Skills are not executable tools. |
| `agents_md` | AGENTS.md or repo instruction content already resolved by the client. Hosted backend must not assume local filesystem access. |
| `plugins` | Plugin metadata and plugin prompt layers. Plugin executable tools still belong in `tools.client_manifest`. |
| `runtime` | OS, workspace, and coordinate-method facts that affect prompt rendering and tool policy. |

## Tool Modes

- `default`: use backend/default WindieOS tools.
- `default_plus_client`: use default tools plus accepted client tools.
- `client_only`: expose accepted client tools and explicitly enabled remote tools.
- `explicit`: expose `available_tools` plus accepted client tools and explicitly
  enabled remote tools.

## Prompt Sources

Clients should resolve local content before sending it:

- read `AGENTS.md` locally and send entries in `agents_md`
- read extension `skills/*/SKILL.md` locally and send entries in `skills`
- read extension/plugin prompt files locally and send entries in `prompt_layers`
- send executable tool schemas through `tools.client_manifest`

This keeps hosted WindieOS usable by non-Electron clients without giving the
backend access to local paths.

## SDK Debug Routes

`/api/sdk/prompt-preview` and `/api/sdk/query-plan` accept the same
`agent_definition` object. Use those routes to inspect the compiled system
prompt, prompt messages, and model-visible tool schemas before running a turn.
