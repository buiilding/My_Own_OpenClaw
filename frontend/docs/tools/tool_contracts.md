---
summary: "Tool contract map covering backend model-facing schemas, SDK/main local dispatch, Electron client manifest builder ownership, local-runtime executable tools, bundles, request ids, and validation."
read_when:
  - When changing tool schemas or tool result payloads.
  - When debugging backend, SDK/main, renderer, or local-runtime tool-contract drift.
  - When changing `frontend/src/main/extensions/tool_manifest.cjs`, the client manifest builder export, or stale tool manifest name-list helper references.
title: "Tool Contracts"
---

# Tool Contracts

WindieOS uses two tool-schema contracts:

- **Backend-owned remote schema**: backend tools such as `web_search`.
- **Client-owned local schema**: what the LLM can call for local-runtime tools.

The public client sends local tool schemas through
`agent_definition.tools.client_manifest` during websocket handshake; the hosted
backend validates that manifest, applies policy/provider projection, and can
resolve high-level or grounded intent into a simpler local-runtime executable
action.
Built-in local tool schemas are generated from the local-runtime Python
contract into
`frontend/src/main/generated/builtin_tool_manifest.json`, which Electron loads
into the agent definition for the websocket handshake.

## Operating Contracts

- Tools execute on the local runtime, currently implemented by the Python
  local-runtime service,
  unless they are explicit backend remote tools such as `web_search`.
  Frontend/local-runtime owners provide executable implementations and
  manifests; backend validates client manifests, enforces schema and trust
  boundaries, applies provider projection, owns backend remote tools, and owns
  final prompt compilation.
- Local tool schemas are client-side and assembled from selected built-ins plus
  plugins and MCP contributions. Backend default built-in schemas are
  fallback/hosted defaults; the client manifest may overwrite the active local
  tool surface.
- Tool changes should update the client manifest, docs, and focused tests while
  preserving schema parity without importing backend code into frontend or
  local-runtime implementation code.
- MCP tool results should preserve the raw MCP result for every MCP tool,
  current and future. The MCP adapter may wrap results in WindieOS native tool
  call/tool output envelopes while preserving MCP `content`,
  `structuredContent`, and other returned fields without summarizing,
  flattening, or discarding them. Model-facing `data.output` should contain the
  MCP result content, and `data.mcp_result` should keep the raw object for
  inspection. If an MCP result contains image content, additively promote it
  into WindieOS native image fields such as `data.screenshot` and
  `data.screenshot_content_type` without rewriting or removing the raw MCP
  result.
- Computer-use tools should return automatic post-action screenshot context in
  their tool outputs. Tool bundles that include any computer-use action should
  also return screenshot context for the bundle output; capture once after the
  bundle unless an explicit successful screenshot step already provides the
  needed image.
- Model-visible tool-result images must carry MIME that matches the actual
  bytes before provider dispatch. Backend shared image normalization detects
  PNG/JPEG/WebP/GIF payloads, repairs stale data-URL MIME, and drops
  unidentified bare image payloads instead of guessing a generic PNG default.
- SDK-local persistence must not store raw image bytes from local tool results.
  Inline visual fields such as `screenshot` and `image_data` are materialized
  into artifacts, replay uses typed display attachments, and persisted
  tool-output events keep refs plus metadata instead of base64 payloads.
- Built-in grounded tools should preserve the model-schema vs prepared-argument
  distinction. Use `backend_grounding` only when OCR, vision, or prediction
  prepares executable local-runtime arguments; otherwise use `passthrough`.
  Example: backend may resolve higher-level screen intent into coordinates
  while frontend/local runtime receives and executes a simpler action such as
  `click(100, 200)`.
- Prefer parity tests that verify schemas and registries stay aligned.
- Extension contribution types stay separated by active contribution root:
  plugin metadata and local-runtime tool declarations in
  `plugins/<id>/plugin.json`, plugin schemas in `plugins/<id>/schemas/`, plugin
  Python entrypoints in `plugins/<id>/python/`, MCP server specs in
  `mcps/<id>/mcp.json`, and skills in `skills/<skill-id>/SKILL.md`.
- Python local-runtime plugin tools use `name`, `schema`, and `entrypoint`.
  Skills become prompt layers, not executable tools. Keep
  [Extension Convention](../development/extensions.md) as the canonical
  extension authoring guide and [Plugins and Extensions Hub](../plugins/README.md)
  as the routing hub.

## Electron Client Manifest Builder

`frontend/src/main/extensions/tool_manifest.cjs` is the Electron-side
loader/merger for that generated built-in manifest plus plugin tools. Its public
export is `buildClientToolManifest(...)`. It must not become a second authority
for built-in tool names, and removed name-list helper exports should stay
deleted; consumers that need the active tool surface should read the built
manifest and its accepted/rejected backend transparency instead of importing a
separate manifest name list.

Extension manifests use one developer-facing JSON Schema field: `schema`.
Extension authors pair that with `entrypoint`; local-runtime dispatch calls the
entrypoint through the Python implementation with the arguments emitted for
that tool.

## Contract Families

| Contract family | Model can see it? | Executed by | Producer | Backend responsibility | Drift check |
| --- | --- | --- | --- | --- | --- |
| backend remote tool | yes | backend service or remote route | backend tool catalog | schema, policy, parser, result/history conversion | No local-runtime executable parity is needed, but provider projection and policy still apply. |
| client/local-runtime manifest tool | yes, after validation | local runtime executor or declared backend target for reserved tools | Electron/local-runtime `agent_definition.tools.client_manifest` | validation, accept/reject transparency, policy, provider projection | Built-in tool names use backend catalog specs for provider-visible schemas; the local-runtime manifest only proves executable capability and argument-resolution metadata. Dynamic tools use their client manifest schema. |
| provider-native declaration | yes, provider-specific | provider/runtime adapter | backend provider projection | provider dialect, parser compatibility, policy pruning | Projection may change dialect, not semantics. |
| local-executor-only helper | no until exposed | local executor | local-runtime executable registry backed by local-runtime Python modules | none unless promoted | Do not add prompt/schema visibility just because helper code exists. |
| renderer display projection | no | renderer UI | stream/transcript consumers | none unless backend emits event contract | Display rows must not become the source of model-facing truth. |

## Client Tool Manifest Shape

Backend validation accepts a partial manifest so one bad tool does not fail the whole websocket session. The public result is split into accepted and rejected entries and can be emitted to the client as manifest transparency.

Accepted tool entries normalize to:

| Field | Shape | Rule |
| --- | --- | --- |
| `name` | string matching `[a-zA-Z][a-zA-Z0-9_-]{0,95}` | unique within the manifest; reserved backend names are rejected unless explicitly overridable |
| `description` | non-empty string, capped length | becomes the model-facing function description when the schema does not already provide one |
| `execution_target` | `local_runtime` or `backend` | arbitrary client manifests cannot add new backend tools |
| `schema` | supported JSON Schema subset or full function tool spec | backend-validation schema; dynamic tools convert it into a canonical flat function schema for prompt construction |
| `executable_schema` | optional supported JSON Schema subset | executable local-runtime argument schema after backend preparation; preserved for transparency and diagnostics, not provider projection |
| `argument_resolution` | `passthrough` or `backend_grounding` | tells reviewers whether backend preparation may transform model args before execution |

Rejected entries return `{name, reason}`. Treat rejection reasons as developer diagnostics, not model-facing prompt content.

Client/local-runtime schemas are merged with backend registry schemas before policy filtering. Built-in local tool names use backend catalog specs for the final provider-visible schema, while their manifest entries prove executable capability and argument-resolution metadata. Dynamic client/local-runtime tools use their manifest `schema` as the accepted function schema. After merging, `ToolPolicy` and provider projection still decide the final model-visible shape.

## Contract Flow

1. The local-runtime manifest generator creates the built-in local manifest from `frontend/src/main/python/tools/manifest.py` into `frontend/src/main/generated/builtin_tool_manifest.json`.
2. Electron loads the generated built-in manifest and merges plugin/MCP tools.
   - MCP stdio clients are cached by server identity, command, args, cwd, and a hashed fingerprint of configured env key/value pairs so changed credentials or endpoints create a fresh client without placing raw secrets in the cache key.
3. Client sends `agent_definition.tools.client_manifest` during websocket
   handshake.
4. Backend validates accepted/rejected manifest entries.
5. Backend builds backend remote tool schemas from `backend/src/tools/tool_catalog.py` and remote tool classes.
6. Prompt construction merges accepted dynamic client/local-runtime schemas with backend remote schemas; accepted built-in local tool names keep backend catalog specs.
7. Tool policy and provider/capability health narrow the exposed schema for the current session.
8. Backend emits transparency for accepted/rejected manifest entries, final tool schemas, and active `client_prompt_layers`.
9. The model emits a tool call.
10. Backend parser and preparation code validates, normalizes, and enriches the call.
11. Backend sends the executable payload over websocket as `tool-call` or `tool-bundle`.
12. SDK runtime dispatches through Electron main to the SDK local runtime/local executor.
13. Main/local executor run local work through the daemon or JSON-RPC bridge.
14. SDK runtime returns `tool-result` or `tool-bundle-result`.
15. Backend transforms the result into model-facing history and continues the loop.

## Shape Separation Rules

- `agent_definition.tools.client_manifest` is capability input to backend
  validation; local-runtime `entrypoint` is executable implementation.
- `schema` is the developer-authored extension schema field; `function_tool_schema` is the backend-normalized model-facing shape.
- For built-in local tool names, backend validation accepts the manifest but
  provider-visible schemas come from the backend tool catalog. The
  local-runtime manifest schema is used for capability validation and dispatch
  metadata, not final provider description authority.
- Built-in manifests may include `executable_schema` to make the local-runtime
  argument boundary explicit when `schema` contains backend grounding metadata.
- `argument_resolution=passthrough` means model args should already be executable; `backend_grounding` means backend preparation may resolve higher-level intent first.
- `request_id`, `bundle_id`, `tool_call_id`, and renderer `correlation_id` join different stages. Do not collapse them unless the producer and consumer really share the same domain.
- Local runtime results must put model-facing text in `data.output`. Structured
  fields may remain in the payload for UI/debugging, but backend history reads
  only `output` and does not infer text from tool-specific fields such as
  `snapshot`, `extracted_content`, or `matches`.
- MCP-backed local results are an exception to any local summarization habit:
  preserve the MCP server's raw result for every MCP tool, including `content`,
  `structuredContent`, and other returned fields. Put the serialized MCP result
  content in `data.output` so model history can see it, but elide image base64
  there after promotion. Keep the raw object in `data.mcp_result` for
  inspection. If an MCP item contains image data, additively promote it into
  WindieOS native image fields such as `data.screenshot` and
  `data.screenshot_content_type`; do not remove or rewrite the original MCP
  result.
- Backend may truncate raw `data.output` with the selected model's tokenizer
  when available, then falls back to the conservative character estimate.
- Backend remote tools can be model-visible without local-runtime entries. Local
  helper implementations can exist without model visibility.
- Provider-native declarations can coexist with function schemas, but policy must still prevent disabled helper schemas from leaking back into the prompt.

## Files to Inspect

| Concern | Files |
| --- | --- |
| Built-in local manifest source | `frontend/src/main/python/tools/manifest.py`, `frontend/src/main/python/tools/schemas.py`, `frontend/src/main/python/windie_shared/browser_contract*` |
| Generated Electron manifest artifact | `frontend/src/main/generated/builtin_tool_manifest.json`, `scripts/generate-builtin-tool-manifest` |
| Client manifest validation | `backend/src/tools/client_manifest.py` |
| Client manifest agent definition | `frontend/src/main/agent/electron_agent_definition_inputs.cjs`, `frontend/src/main/extensions/tool_manifest.cjs`, `packages/windie-sdk-js/src/runtime/AgentDefinition.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts` |
| Backend tool catalog | `backend/src/tools/tool_catalog.py` |
| Backend schemas and remote tools | `backend/src/tools/remote_tools/*`, `backend/src/tools/*schema*` |
| Tool policy and capability filters | `backend/src/tools/tool_policy.py`, `backend/src/tools/provider_health.py` |
| Prompt merge and projection | `backend/src/llm/prompts/prompt_constructor.py`, `backend/src/tools/provider_projection.py` |
| Preparation and coordinate resolution | `backend/src/agent/tools/preparation/*` |
| Sending/waiting/processing | `backend/src/agent/tools/sending/*`, `backend/src/agent/tools/waiting/*`, `backend/src/agent/tools/processing/*` |
| SDK/local execution | `packages/windie-sdk-js/src/index.ts`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` |
| Main local-runtime bridge | `frontend/src/main/sidecar/local_runtime*.cjs` |
| Local-runtime executable registry | `frontend/src/main/python/tools/registry.py` |

For a step-by-step change route across these owners, use [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md).

## Validation Checklist

- Backend schema and parser tests cover the model-facing shape.
- Client manifest tests cover accepted, rejected, duplicate, reserved, oversized, and grounding-mode entries.
- SDK runtime and main-process tool-router tests cover correlation and result envelopes.
- Local-runtime registry/tool tests cover executable behavior.
- Cross-layer parity tests cover expected backend-exposed local-runtime tool names.
- Bundle paths cover atomic success, partial failure, timeout, and cleanup.

## Evidence Notes

- Contract updates must preserve raw tool or MCP payloads when wrappers add
  WindieOS-native metadata.
- Do not use renderer display rows as proof that model-facing schema, prepared
  arguments, and local execution contracts all agree.
