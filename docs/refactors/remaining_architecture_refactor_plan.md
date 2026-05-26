---
summary: "Current-state deletion-first refactor plan for remaining WindieOS runtime ownership debt."
read_when:
  - When planning cleanup that touches query prompt assembly, backend event contracts, SDK source duplication, memory/config IPC, tool manifests, or Electron main bridge ownership.
  - When a bug suggests renderer, Electron main, SDK, sidecar, or backend still have duplicate authority for the same runtime behavior.
title: "Remaining Architecture Refactor Plan"
---

# Remaining Architecture Refactor Plan

This plan tracks the refactors that still matter after the SDK-first ownership
migration. It focuses on duplicated authority, model-visible behavior outside
the backend, renderer access to local authority, and hand-maintained runtime
mirrors.

Use this as a deletion checklist. Do not turn these items into compatibility
layers unless a verified external dependency requires one.

## Current Consistency To Preserve

- Backend owns the live model/tool loop through `AgentSession`,
  `AgentExecutor`, and `InteractionLoop`.
- SDK owns client-side tool coordination and result return. Electron main
  provides the local execution callback, and renderer-originated tool-result
  sends are ignored.
- Conversation continuity is mostly behind SDK stores and desktop renderer
  facades. Keep new transcript, replay, and rehydrate behavior in those
  surfaces instead of feature components.
- Sidecar owns local execution and storage mechanics; backend sees local
  capability through manifests and transport contracts.

## Refactor Checklist

- [x] Move final query prompt assembly to the backend.

  Issue: Electron main currently assembles model-visible XML/text for local
  memory, attached-file context, user query wrapping, and prompt fragments
  before sending the websocket query. That gives main process partial prompt
  authority even though backend owns prompt construction and final model-facing
  history.

  Owner: Backend prompt construction owns final model-visible text. Electron
  main may collect local context and send structured fields only.

  Implement: Add a structured desktop query context contract for local memory
  snippets, file attachments, repo instructions, system state, and raw user
  text. Teach the backend prompt path to render those fields into the final
  provider prompt.

  Delete: Remove model-visible XML/text assembly from the Electron query
  payload builder and replace tests that assert exact main-process prompt
  strings with backend prompt-construction tests plus websocket contract tests.

  Exclusions: Do not move screenshot capture, local file reads, or sidecar
  memory retrieval into the backend. Only move final prompt formatting.

  Success criteria: Main sends structured context; backend owns the only
  model-visible assembly; live turns still preserve memory, attachment, and repo
  instruction behavior.

  Validation: Backend prompt tests, frontend query payload tests, websocket
  schema tests, and a focused desktop send-query integration test.

- [x] Delete the renderer-owned backend event contract.

  Issue: Renderer still has a backend event type module that mirrors SDK event
  contracts even though chat runtime tests already enforce that chat feature
  code should consume SDK-normalized conversation events and projections.

  Owner: SDK transport owns raw backend event normalization. Electron main owns
  event fan-out. Renderer owns display projections only.

  Implement: Move any remaining non-chat consumers from raw backend event names
  to SDK `ConversationEvent` or current-turn projection data. Keep renderer
  event types display-scoped.

  Delete: Remove renderer backend-event unions, validators, and source labels
  that duplicate SDK transport contracts after all imports are gone.

  Exclusions: Do not delete SDK backend event types or backend websocket
  formatter schemas.

  Success criteria: Renderer has no raw backend websocket event contract; SDK
  remains the single client-side normalization boundary.

  Validation: Runtime boundary import tests, SDK event normalizer tests,
  renderer projection tests, and frontend lint.

- [x] Remove hand-maintained SDK CommonJS source mirrors.

  Issue: Electron main imports CommonJS copies of SDK transport, projection,
  and tool-coordination modules from `packages/windie-sdk-js/src`. The package
  also has TypeScript sources and an ESM build path, so shared runtime behavior
  can drift across hand-maintained module formats.

  Owner: SDK package owns reusable runtime source and build output. Electron
  main should consume a built or generated SDK entrypoint, not duplicate source
  files.

  Implement: Choose one explicit module strategy: either generate CommonJS
  build output from TypeScript for Electron main, or migrate the main SDK host
  imports to an ESM-compatible boundary.

  Delete: Remove `.cjs` SDK mirrors from source and stop importing SDK internals
  through `packages/windie-sdk-js/src/*.cjs`.

  Exclusions: Do not rewrite Electron main to ESM as part of unrelated feature
  work. This is a build/runtime boundary migration.

  Success criteria: One SDK source of truth produces all consumed module
  formats; main process imports come from package entrypoints or generated
  build output.

  Validation: SDK tests, Electron main IPC tests, package build, and frontend CI
  tests.

- [x] Put dashboard memory actions behind a runtime client.

  Issue: Dashboard memory UI still invokes IPC memory and destructive local
  state channels directly. That keeps feature components aware of sidecar-shaped
  channel names and bypasses the SDK/facade boundary used for conversation
  continuity.

  Owner: A desktop memory runtime client, backed by SDK/local sidecar runtime,
  should own memory list, delete, clear, and status operations. Renderer feature
  components should call that client.

  Implement: Add a narrow memory facade with typed methods for list episodic
  memory, list semantic memory, delete memory item, clear local memory, and
  clear chat history. Wire dashboard components through the facade.

  Delete: Remove direct `IpcBridge.invoke(...)` calls for memory/channel names
  from dashboard feature components and settings hooks.

  Exclusions: Do not change sidecar memory storage format unless the facade
  exposes a needed migration point.

  Success criteria: Renderer memory UI imports no IPC channel constants for
  sidecar memory behavior; sidecar RPC details are contained below the facade.

  Validation: Renderer unit tests for memory actions, IPC boundary import tests,
  sidecar memory tests, and frontend lint.

- [x] Move provider secret persistence out of renderer-shaped config.

  Issue: Renderer config types still include provider API keys and OAuth token
  fields. Local storage redaction exists, but the main-process frontend config
  save path can persist the renderer-provided config payload to disk.

  Owner: Electron main or backend settings owns secret persistence and
  redaction. Renderer owns redacted provider status and user edits in memory
  only.

  Implement: Split provider credentials from display config. Persist secrets
  through a dedicated main/backend settings path with explicit redaction on
  load, save, and broadcast.

  Delete: Remove secret-bearing `provider_api_keys` and `provider_oauth` fields
  from renderer-persisted config payloads and disk JSON written by the frontend
  config IPC handler.

  Exclusions: Do not change provider routing or backend model selection in the
  same patch.

  Success criteria: Renderer persisted config cannot contain raw provider
  secrets; settings screens can still show configured/unconfigured provider
  status and save credential changes through the owned path.

  Validation: Main config persistence tests, renderer settings tests, backend
  settings redaction tests, and a manual check of the written config file with
  throwaway credentials.

- [ ] Split sidecar capability manifests from final model-facing tool
  projection.

  Issue: Sidecar manifest code exports executable tool capability and applies
  model-facing naming/description overrides. Backend also owns tool catalog,
  policy, provider projection, and final prompt/tool schema exposure. The parity
  tests catch some drift, but the naming still blurs capability reporting with
  final provider-visible schema authority.

  Owner: Sidecar owns executable local capability manifests. Backend owns final
  model-facing tool projection and policy. SDK transports capability and
  executes local calls.

  Implement: Rename and separate sidecar executable capability fields from
  backend model-facing projection fields. Keep enough sidecar metadata for
  backend validation and argument-resolution routing, but make final provider
  descriptions and policy a backend concern.

  Delete: Remove ambiguous sidecar `model_facing` naming and any duplicate
  descriptions that are no longer needed for capability validation.

  Exclusions: Do not collapse backend remote tools into sidecar manifests.

  Success criteria: A reader can tell whether a field describes executable
  sidecar capability, backend validation metadata, or provider-visible schema.

  Validation: Sidecar/backend tool parity tests, backend provider projection
  tests, SDK tool execution tests, and docs updates for tool schema policy.

- [ ] Shrink Electron main IPC into focused ownership modules.

  Issue: The main IPC composition root still mixes runtime construction, query
  send, overlay state, settings sync, config persistence, generic backend
  forwarding, and event broadcast. That makes it easy to add new bridge behavior
  in the wrong layer.

  Owner: Electron main owns IPC registration and desktop shell policy, but each
  runtime concern should sit behind a focused module with a testable boundary.

  Implement: Extract query dispatch, frontend config persistence, SDK runtime
  lifecycle, overlay/surface commands, and backend forwarding into separate
  modules with narrow registration functions.

  Delete: Remove inline policy and orchestration from the top-level IPC file as
  each module takes ownership.

  Exclusions: Do not change query semantics, overlay semantics, or settings
  schema in this cleanup unless the extracted module exposes an existing bug.

  Success criteria: The IPC composition root reads as registration wiring, not
  business logic.

  Validation: Main IPC tests, query dispatch tests, frontend config tests, and
  Electron smoke launch.

- [ ] Split the local backend bridge into process, transport, RPC, and status
  ownership.

  Issue: The sidecar/local backend bridge still carries process supervision,
  JSON-RPC transport, request routing, tool host behavior, and status broadcast
  logic in one large module.

  Owner: Electron main owns sidecar supervision and bridge transport. Sidecar
  owns execution/storage. SDK/local runtime owns reusable client-side local
  runtime behavior.

  Implement: Split process lifecycle, JSON-RPC client transport, RPC method
  mapping, tool host adapter, and status broadcasting into focused modules.

  Delete: Remove catch-all bridge helper functions once their behavior is owned
  by the extracted modules.

  Exclusions: Do not change the sidecar wire protocol unless a separate
  migration note covers compatibility.

  Success criteria: Sidecar lifecycle failures, RPC failures, and tool failures
  can be tested independently without constructing the whole bridge.

  Validation: Sidecar bridge tests, local tool dispatch tests, and Electron
  startup smoke testing.

## Cross-Cutting Guardrails

- Prefer deleting the old path in the same patch that introduces the new owner.
- Add compatibility only for verified persisted data or external package
  consumers.
- Keep renderer feature code free of backend websocket events, sidecar RPC
  names, raw tool execution, prompt assembly, and secret persistence.
- Keep Electron main free of backend prompt policy, provider routing, and
  duplicate SDK runtime logic.
- Keep backend free of sidecar implementation imports; use manifests,
  transport payloads, and parity tests.

## Minimum Validation Matrix

- Backend prompt or tool projection changes: backend tests plus focused SDK or
  sidecar parity tests.
- Renderer boundary changes: frontend runtime boundary tests, renderer unit
  tests, and lint.
- Electron main ownership changes: IPC tests and Electron smoke launch.
- SDK source/build changes: SDK tests, package build, and frontend CI tests.
- Secret/config changes: redaction tests and a manual disk persistence check
  with throwaway credentials.
