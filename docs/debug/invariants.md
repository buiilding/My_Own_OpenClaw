---
summary: "Central invariant ledger for WindieOS agent workflow, routing durable product, runtime, tool, and extension invariants to owner docs and regression packs."
read_when:
  - When adding, moving, or reviewing durable WindieOS invariants.
  - When a bug fix creates a new invariant and you need to choose the owner doc, regression pack, and validation route.
  - When AGENTS.md starts accumulating detailed contracts that should live in docs instead.
title: "Invariants"
---

# Invariants

This page is the central ledger for durable WindieOS invariants. Keep detailed
implementation contracts in the owner doc for the affected runtime, and use this
page to route agents to those owner docs and regression packs.

AGENTS.md should stay focused on operating workflow. When an invariant becomes
too detailed for AGENTS.md, move it here or to an owner doc, then link it from
this page.

## Invariant Placement

| Invariant type | Owner doc | Regression route |
| --- | --- | --- |
| User-visible product behavior | [User-Facing Regression Pack](user_facing_regression_pack.md) | `<windie> test user-facing` |
| Core loop UI behavior | [Core Loop Regression Pack](core_loop_regression_pack.md) | `<windie> test core-loop` |
| Frontend runtime and overlay behavior | [Frontend Runtime Invariants and PR Checklist](../frontend/runtime/frontend_runtime_invariants_checklist.md) | Frontend owner tests listed in the checklist |
| Tool and extension contracts | [Tool Contracts](../tools/tool_contracts.md) | Tool schema, SDK/main, local-runtime, and parity tests listed in the tool docs |
| Security-sensitive behavior | [Security Boundary Matrix](../security/security_boundary_matrix.md) | Owner-specific security and boundary tests |
| Runtime ownership decisions | [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md) | Owner-runtime tests for the enforcing boundary |

## Settings And Model Selection

- Agent settings edited in the renderer must update Electron main's redacted
  desktop UI config store before the next query attaches `agent_definition`;
  disk persistence is not allowed to be the live-turn gate, and partial renderer
  config payloads must not erase absent Agent prompt/tool-policy fields from
  the live store. Query-time Agent config assembly must repair stale empty live
  Agent prompt/tool-policy fields from persisted non-empty settings before
  falling back to startup defaults, while still respecting explicit empty values
  saved through the frontend config IPC path. Replayed or supplied query
  `agent_definition` payloads must not override the current Electron-generated
  Agent system prompt or tool policy, because edit/resend can otherwise
  resurrect stale prompts or disabled local-tool manifests.
- Electron main adapters must preserve query-local Agent settings across SDK
  runtime boundaries: the direct wake-up adapter receives `AgentQueryInput`,
  but `ConversationRuntime.send` consumes `payload.agent_definition`, so the
  adapter must translate the query Agent definition, screenshots, attachments,
  workspace state, resources, metadata, and model override into the runtime send
  shape before dispatch.
- Normal renderer sends and SDK replay commands share Electron main's
  runtime-turn context preparation before any SDK send reaches backend
  inference. Replay may replace/supersede display rows and create revisions,
  but it must not own separate Agent config assembly or fall back to startup
  SDK session definitions; each replay turn attaches the current
  Electron-generated `payload.agent_definition` from the live desktop UI config
  store.
- Selected chat models must be applied before inference starts: normal sends and
  manual compaction await the SDK settings ACK, while retry/edit replay carries
  the model through SDK replay commands into `ConversationRuntime.send()`, where
  the same per-turn `setModel(...)` gate runs before the backend query dispatch.
  Model selection must not be smuggled through backend query payload fields. See
  the Settings startup and Model send selection rows in the [User-Facing
  Regression Pack](user_facing_regression_pack.md).

## Adding An Invariant

For every new invariant, record:

1. Symptom or behavior being protected.
2. Named invariant.
3. Owner runtime that enforces it.
4. Smallest replay or reproduction timeline.
5. Regression proof, usually an owner-correct unit, integration, diagnostic, or
   screenshot check.
6. Product-level pack entry only when normal users can hit the behavior.

Do not create umbrella-only tests just to make a checklist tidy. Keep tests at
the owner-correct layer and register focused routes here or in the relevant pack.

## Tool And Extension Contracts

Tool and extension invariants live in [Tool Contracts](../tools/tool_contracts.md).
They currently include:

- Tools execute on the local runtime, currently backed by the Python sidecar,
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
- Python sidecar-backed plugin tools use `name`, `schema`, and `entrypoint`.
  Skills become prompt layers, not executable tools. Keep
  [Extension Convention](../development/extensions.md) as the canonical
  extension authoring guide and [Plugins and Extensions Hub](../plugins/README.md)
  as the routing hub.

## Evidence Notes

- Prefer owner docs over duplicating long invariant text in AGENTS.md.
- If an invariant spans multiple runtimes, name the runtime that enforces it,
  then link related consumer docs as supporting context.
- If no existing diagnostic exposes a product-visible invariant, add the
  missing owned diagnostic or focused command with the fix.
