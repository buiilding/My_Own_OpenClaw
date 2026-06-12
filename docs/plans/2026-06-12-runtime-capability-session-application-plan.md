---
summary: "Plan for redesigning runtime capability application so MCPs, plugins, skills, and built-ins update active backend sessions immediately and coherently."
read_when:
  - When fixing runtime-added MCP, plugin, or skill contributions that are accepted by the backend but missing from model-visible prompts.
  - When changing client tool manifests, prompt layers, agent definitions, backend tool policy, session config rewiring, or capability-related trace events.
title: "Runtime Capability Session Application Plan"
---

# Runtime Capability Session Application Plan

## User Intent

Runtime externals should behave like first-class active agent capabilities.
When the user enables an MCP, plugin, or skill, WindieOS should persist that
choice locally, rebuild the active capability manifest, send it to the backend,
apply it to the current active session, record the capability revision in the
conversation timeline, and use the new tools or prompt layers on the next model
turn without requiring an app restart or a new conversation.

The current failure proves the missing invariant: CUA Driver MCP tools can be
discovered, registered, sent to the backend, validated, and assigned to
`PromptConstructor.client_tool_schemas`, but the final prompt still exposes only
the old native tool allowlist because the session `ToolPolicy` remains cached
from stale config.

## Deterministic Problem Statement

The backend currently has separate partial paths for related state:

- client manifest validation accepts client-local tool schemas
- prompt builder stores accepted client schemas
- tool policy is built from session config
- session config owns `agent_available_tools`
- prompt construction filters accepted schemas through `ToolPolicy`

Those pieces are correct individually, but they are not applied atomically.
When runtime contributions change after session creation, the accepted schemas
move forward while policy state does not. The backend therefore accepts the
new tools, then filters them out before provider prompt construction.

This is not an MCP-specific problem. The same architecture gap will affect any
runtime contribution that changes the model-visible surface:

- MCP tools
- plugin tools
- skill prompt layers
- enabled remote tools
- future extension prompt layers or capability metadata

## Architecture Decision

Redesign the existing backend capability application boundary. Do not add a
parallel backend layer for MCPs, plugins, or skills.

The backend should continue to own:

- structural validation of client-provided manifests
- final model-visible policy
- provider projection
- prompt construction
- prompt/tool transparency traces
- model-visible history

The SDK/Electron/local runtime should continue to own:

- local discovery of plugins, MCPs, skills, and built-in local tools
- local persisted enablement
- local execution routing for sidecar, plugin, and MCP tools
- local status/probe diagnostics

The new invariant:

```text
If the backend accepts a runtime capability for an active session, the same
application step must update the effective session policy/prompt state before
the next prompt build.
```

## Target Runtime Model

Introduce one normalized active capability contract from the client runtime to
the backend. This may evolve from the existing `client_tool_manifest` and
`agent_definition` payloads rather than replacing them in one large break.

Conceptual shape:

```json
{
  "revision": "cap_rev_000123",
  "tools": [
    {
      "name": "cua_driver__list_apps",
      "description": "...",
      "schema": {},
      "execution_target": "mcp",
      "argument_resolution": "passthrough",
      "provenance": {
        "kind": "mcp",
        "id": "cua-driver",
        "original_name": "list_apps"
      }
    }
  ],
  "prompt_layers": [
    {
      "id": "skill:repo-agent",
      "type": "skill",
      "priority": 75,
      "content": "..."
    }
  ],
  "enabled_remote_tools": ["web_search"],
  "disabled_tools": [],
  "metadata": {
    "source": "desktop-runtime",
    "workspace": "WindieOS"
  }
}
```

MCPs, plugins, skills, and built-ins are contribution producers. The backend
consumes the normalized accepted result, not the producer-specific mechanics.

## Single Capability Application Path

All runtime contribution changes should flow through one backend session
application function.

```text
SDK/Electron active contribution set
        |
        v
client capability manifest revision
        |
        v
backend validation
        |
        v
accepted session capability state
        |
        v
session config/tool policy/prompt layers updated atomically
        |
        v
next prompt build
```

The important behavior is not the class name. The important boundary is that
validation, policy update, prompt-layer update, and prompt-builder rewire happen
as one operation under the session mutation lock.

## Backend Design

### 1. Add Accepted Session Capability State

Represent the backend-accepted capability set explicitly in session runtime
state. It should include:

- manifest revision
- accepted client tool schemas
- accepted client tool names
- rejected tool diagnostics
- accepted prompt layers and skills
- rejected prompt-layer diagnostics
- enabled remote tool names
- disabled tool names
- provenance summary by source kind

This state is diagnostic and operational. It should answer:

- what did the backend accept?
- what did it reject and why?
- what names should policy allow?
- what prompt layers should compile?
- what revision did this turn use?

### 2. Apply Capabilities To Config And Policy

Accepted capabilities must update effective session policy before prompt
construction.

For tools:

- derive accepted tool names from validation result
- combine with enabled remote tools
- combine with explicit user-selected built-ins when relevant
- compute the effective `agent_available_tools`
- keep disabled tools and capability gates authoritative
- rebuild or refresh `ToolPolicy` from the new effective config

For prompt layers:

- validate accepted skill/plugin prompt-layer shape
- merge them with existing agent prompt context in priority order
- preserve repo instructions and runtime OS/workspace context
- avoid duplicate prompt-layer insertion when the same revision is applied more
  than once

### 3. Preserve Policy As The Gate

Do not fix visibility by skipping `ToolPolicy` for client tools. The correct
chain is:

```text
accepted client schemas -> effective session policy -> provider-visible schemas
```

`ToolPolicy` remains the final backend gate for disabled tools, profiles,
provider health, interaction mode, browser availability, and future trust
controls. The bug is stale policy state, not too much policy.

### 4. Make PromptConstructor A Consumer

`PromptConstructor` should consume already-applied session capability state. It
should not own runtime contribution application. It may still:

- merge accepted client schemas with backend registry schemas
- filter through current `ToolPolicy`
- provider-project schemas
- emit prompt transparency

It should not be the place where MCP/plugin/skill enablement decisions happen.

### 5. Unify Handshake, Settings Update, And Per-Turn Agent Definition

The same backend application path should be used by:

- websocket handshake `agent_definition`
- `update-settings` / SDK runtime capability updates
- query-level `agent_definition`
- prompt preview and query-plan routes when they accept agent definitions

The current split is the core regression risk. Handshake can update config
overrides, while later manifest updates can only update `client_tool_schemas`.
That distinction should disappear.

## SDK And Electron Design

### 1. Capability Manager Owns Local Contributions

SDK/Electron should build one active capability manifest from:

- built-in local tools
- enabled plugin tools
- enabled MCP discovered tools
- enabled skills
- enabled backend remote tools
- explicit disabled tools

The renderer should express user intent. Electron/SDK owns discovery,
enablement persistence, and capability rebuild.

### 2. Persistence Is Local And Source-Agnostic

Persist enablement by contribution id, not by current discovered tool names.

Examples:

```json
{
  "enabled_mcps": ["cua-driver"],
  "enabled_plugins": ["repo-agent"],
  "enabled_skills": ["repo-agent"],
  "disabled_tools": []
}
```

Tool names are discovered output. Enablement is user policy. Do not persist a
stale `cua_driver__list_apps` list as the source of truth.

### 3. Revision Every Capability Change

Every rebuild should produce a deterministic revision. The revision can be a
monotonic counter, content hash, or generated id, but it must be stable enough
for traces and history rows to correlate:

- local enablement changed
- manifest rebuilt
- backend validated
- backend applied
- prompt built with revision
- tool call dispatched using revision

### 4. Execution Routes Stay Local

The backend should not execute local MCP/plugin tools. The SDK/local runtime
must retain route metadata:

```text
tool name -> builtin | sidecar plugin | MCP server | backend remote
```

When the model calls a client-local tool, backend emits the tool call. SDK
dispatches through the execution route that matches the accepted manifest
revision.

## Conversation And History Semantics

Do not rewrite old history when capabilities change.

Instead:

- append a capability application event to the conversation timeline
- stamp each turn with the capability revision used for prompt construction
- store final tool schema metadata for that turn
- store prompt-layer summary for that turn

This makes old turns historically accurate and new turns immediately capable.

Required history/debug fields:

- conversation id
- turn ref
- capability revision
- raw tool count
- accepted tool count
- rejected tool count
- final model-visible tool count
- source counts: built-in, plugin, MCP, backend remote
- prompt-layer count
- rejected reasons summary

## Trace Plan

Keep the existing traces, but make them prove the full path directly.

### Client/Local Runtime Traces

- `capability_manifest.rebuild`
  - revision
  - built-in count
  - plugin tool count
  - MCP tool count
  - skill prompt-layer count
  - enabled contribution ids
  - rejected/failed discovery ids

- `capability_manifest.persist`
  - persisted keys changed
  - enabled MCP/plugin/skill counts
  - target config path label, not full sensitive paths

- `capability_manifest.send`
  - revision
  - conversation/session target
  - tool count
  - prompt-layer count

### Backend Traces

- `client_capability_manifest.validate`
  - revision
  - raw tool count
  - accepted tool count
  - rejected tool count
  - accepted prompt-layer count
  - rejected prompt-layer count
  - rejected reasons

- `client_capability_manifest.apply`
  - revision
  - accepted tool count
  - accepted prompt-layer count
  - effective `agent_available_tools` count
  - `ToolPolicy` rebuilt yes/no
  - prompt builder client tool count
  - prompt builder prompt-layer count

- `client_capability_manifest.policy`
  - revision
  - policy input count
  - policy allowed count
  - policy rejected count
  - rejected-by-policy sample and reason

- `backend.prompt`
  - revision
  - final model-visible schema count
  - final MCP/plugin/built-in/backend source counts
  - final prompt-layer count

The critical diagnostic question should become answerable from one trace:

```text
Did backend accept CUA, did policy allow it, and did the final prompt include it?
```

## Implementation Phases

### Phase 1: Backend Root Fix

Goal: accepted client tool schemas update effective session policy immediately.

Work:

- identify every backend entrypoint that accepts or stores a client manifest
- route all of them through one session capability application function
- update session config or effective policy with accepted client tool names
- rebuild prompt builder dependencies using the existing config rewire path
- preserve accepted client schemas across rewire
- add traces proving policy count and prompt count

Validation:

- active session starts with 14 native tools
- runtime manifest adds a synthetic `cua_driver__sample` tool
- backend validation accepts it
- policy allows it
- final prompt metadata includes it
- disabled tool policy still removes it when disabled

### Phase 2: Prompt Layers And Skills

Goal: skills and plugin prompt layers can be applied at runtime using the same
capability revision model.

Work:

- validate prompt-layer envelopes from agent definition/capability manifest
- apply accepted prompt layers to session prompt context atomically with tools
- dedupe by prompt-layer id and revision
- stamp prompt metadata with prompt-layer count and ids

Validation:

- enable a skill in an active session
- next prompt includes the skill content
- old history remains unchanged
- duplicate updates do not duplicate prompt text

### Phase 3: SDK Capability Manager Consolidation

Goal: SDK/Electron produces one active capability manifest from all contribution
types.

Work:

- centralize built-in/plugin/MCP/skill collection into one builder
- persist enablement by contribution id
- rebuild and send manifest revision after enable/disable/refresh
- remove MCP-specific backend update assumptions from local code
- keep renderer as a controller/view over local status

Validation:

- enabling CUA rebuilds one manifest with MCP tools
- enabling a plugin rebuilds the same manifest path
- enabling a skill rebuilds the same manifest path with prompt layers
- app restart restores enablement and sends the same active set

### Phase 4: Execution Route Integrity

Goal: every model-visible local tool has a live local execution route, and stale
routes fail explicitly.

Work:

- store route metadata by tool name and revision locally
- dispatch tool calls by accepted route
- refuse stale MCP/plugin calls when source contribution was disabled after
  prompt construction
- return a model-visible tool error instead of silently dropping execution

Validation:

- visible MCP tool executes through MCP runtime
- visible plugin tool executes through sidecar plugin runtime
- disabled-after-prompt MCP call returns explicit unavailable output
- request ids and tool-call ids survive result return

### Phase 5: History, Diagnostics, And Regression Harness

Goal: make this path inspectable and hard to regress.

Work:

- stamp conversation events with capability revision
- add trace commands or filters for capability revisions
- add focused backend tests around validation/apply/policy/prompt count
- add SDK/frontend tests around persistence/rebuild/send
- add a local smoke command if no existing `bin/windie` diagnostic covers the
  full path

Validation:

- one command can show local enabled contributions, backend accepted counts,
  policy allowed counts, and final prompt counts for the latest turn
- a regression where accepted tools are filtered by stale policy fails tests

## Required Tests

Backend:

- accepted client tools update effective `agent_available_tools`
- `ToolPolicy` is rebuilt or refreshed after runtime capability apply
- prompt construction includes newly accepted client tools
- disabled tools still override accepted client tools
- prompt layers apply once and preserve order
- handshake, settings update, and query-level agent definition use the same
  application path

SDK/frontend:

- enablement persists by contribution id across restart
- runtime enable triggers manifest rebuild and send
- MCP, plugin, and skill contributions enter the same manifest shape
- execution route remains paired to model-visible tool name
- stale disabled route produces explicit failure

Trace/history:

- validation trace reports accepted/rejected counts
- apply trace reports effective policy count
- prompt trace reports final source counts
- conversation metadata records capability revision used by each turn

## Non-Goals

- Do not make backend import local plugin, MCP, or skill files.
- Do not make the renderer own tool policy.
- Do not create a backend MCP-specific policy layer.
- Do not bypass `ToolPolicy` for client tools.
- Do not rewrite old conversation history when capabilities change.
- Do not persist discovered tool names as the durable enablement source.
- Do not merge local execution into backend for desktop-only tools.

## Success Criteria

- Enabling an MCP, plugin, or skill updates the current session without restart.
- The next model turn in the same conversation sees accepted tools and prompt
  layers.
- Backend traces directly show validation, application, policy, and final prompt
  counts for a capability revision.
- Tool schema metadata for a turn reports nonzero MCP/plugin counts when those
  contributions are active.
- CUA Driver MCP tools are visible as `cua_driver__*` only when enabled,
  discovered, accepted, policy-allowed, and included in final prompt schemas.
- Disabling a contribution removes it from the next manifest and final prompt.
- Existing disabled-tool/profile/provider policy still wins over accepted
  runtime contributions.

## Rollout Strategy

Use small commits:

1. backend capability application root fix and backend tests
2. backend prompt-layer capability application and tests
3. SDK capability manager consolidation and frontend tests
4. execution route integrity and stale-call handling
5. trace/history diagnostics and docs updates

After each commit:

- run focused tests for the touched runtime
- check latest trace output from a live or fixture conversation
- update the matching implementation report if this plan moves from design to
  execution

## Open Questions Before Implementation

- Should the normalized contract be introduced as `client_capability_manifest`
  immediately, or should the first fix preserve the existing
  `client_tool_manifest` wire shape and add prompt layers in a second pass?
- Should capability revision be generated by SDK/Electron before sending, or by
  backend after validation?
- Should prompt preview/query-plan share the exact active-session application
  path or run against a detached temporary capability state?
- Should skill enablement be persisted separately from plugin enablement when a
  package contributes both?

## Recommended First Implementation Slice

Fix the deterministic bug first without renaming the public wire contract:

1. Add a backend session capability apply helper that accepts the existing
   validated client manifest result and optional agent definition.
2. Derive accepted client tool names.
3. Compute effective `agent_available_tools` using existing agent-definition
   semantics.
4. Apply the updated config through the existing session config rewire path or
   refresh the prompt builder `ToolPolicy` equivalently under the session lock.
5. Preserve accepted client schemas through the rewire.
6. Extend traces to show accepted count, policy allowed count, and final prompt
   count.
7. Add a regression test where a synthetic `cua_driver__sample` tool is accepted
   and appears in final prompt schemas for the same active session.

This first slice keeps the architecture direction but avoids a large wire
renaming while the product is already debugging runtime MCP visibility.
