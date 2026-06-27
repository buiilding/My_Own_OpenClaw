---
summary: "Phased implementation plan to ship WindieOS as a mobile app (iOS/Android) while preserving backend protocol compatibility and defining a mobile-safe tool/runtime model."
read_when:
  - Planning a mobile client for WindieOS.
  - Refactoring renderer code to remove Electron-only assumptions.
  - Defining mobile-safe tool policy and capability negotiation.
---

# WindieOS Mobile App Plan

## Objective

Ship WindieOS on iOS and Android with a realistic feature set first, then expand toward parity where platform constraints allow.

This plan optimizes for:
- Fast first release of a reliable mobile client.
- Reuse of existing backend protocol and as much renderer logic as possible.
- Explicit separation between cross-platform app logic and platform-specific runtime bindings.

## Current Baseline (What Exists Today)

WindieOS is currently desktop-first and Electron-coupled:

- App shell and window lifecycle are implemented in Electron main process code at `frontend/src/main/index.cjs`.
- Renderer-backend communication goes through Electron IPC (`window.ipc`) and a Node WebSocket bridge in `frontend/src/main/ipc.cjs`.
- Tool execution is delegated through SDK local-runtime execution backed by the
  local-runtime Python implementation via
  `frontend/src/main/sidecar/local_runtime_bridge.cjs` and
  `frontend/src/main/python/local_backend.py`.
- Wakeword is a dedicated Python subprocess bridge in `frontend/src/main/wakeword/wakeword_bridge.cjs`.
- Tool schemas are backend-defined remote stubs and currently must match the
  local-runtime exposed set backed by local-runtime Python implementation tests (see
  private backend tests).
- Query payload normalization happens in Electron main (`frontend/src/main/ipc/ipc_query_runtime.cjs`); SDK context enrichment renders memory/attachment/user-query content before `query` is sent.

Mobile blockers from this baseline:

- No Electron main/preload/IPC layer on mobile.
- No portable way to run the current local-runtime Python subprocess model on iOS/Android.
- No desktop window overlay/hotkey model on mobile.
- Current backend CORS defaults only allow `http://localhost:5173` (private backend implementation).
- Memory browsing/deletion UI currently depends on SDK local-runtime-backed
  commands that assume desktop local storage.

## Product Scope Recommendation

### V1: Mobile Companion (Recommended)

Ship a mobile app focused on chat + streaming + transcripts with optional image attachment.

Include:
- Authentication/session bootstrap (if hosted mode is enabled).
- WebSocket chat streaming (`query`, `streaming-response`, `streaming-complete`, error handling).
- Screenshot/photo attachment from mobile device to `/api/artifacts/`.
- Basic settings (model/provider/mode) that map to existing `update-settings` payload.
- Conversation history backed by backend APIs (new REST endpoints required; see Phase 2).

Exclude in V1:
- Desktop computer-control tool execution (`mouse_control`, `keyboard_control`, `switch_window`, etc.).
- Local-runtime memory/tool execution on device.
- Desktop overlay/chatbox UX.

### V2+: Capability Expansion

Add mobile-native tools and richer memory/workflow features after capability negotiation and policy controls are in place.

## Architecture Target

Adopt a runtime-port pattern:

- `shared-app-core`: platform-agnostic app logic (chat store, stream reducers, message formatting, event parsing).
- `runtime-desktop`: Electron + local-runtime adapters.
- `runtime-mobile`: React Native adapters (WebSocket, storage, media capture, optional wakeword).

Key rule:
- Shared app logic must not import Electron APIs or assume `window.ipc` exists.

## Phase Plan

### Phase 0: Architecture and Contract Freeze (1 week)

Deliverables:
- Create this plan’s implementation tracker issue/epic with owners and dates.
- Freeze V1 mobile feature scope and non-goals.
- Define mobile success metrics:
  - cold start time
  - connect success rate
  - stream completion rate
  - crash-free sessions

Acceptance criteria:
- Team alignment on V1 scope and protocol strategy.
- No unresolved architecture decision around local-runtime executable parity for
  V1.

### Phase 1: Decouple Renderer from Electron IPC (2-3 weeks)

Goal:
Extract renderer logic behind transport/runtime interfaces so the same logic can run on mobile.

Implementation steps:
1. Introduce runtime interfaces in frontend app core:
   - `TransportClient` (send/listen for backend events)
   - `ToolExecutor` (optional capability)
   - `SystemCaptureProvider` (optional capability)
   - `ArtifactUploadClient` (HTTP upload)
   - `SettingsStore` (local persistence)
2. Refactor Electron-only call sites to go through interfaces:
   - `frontend/src/renderer/infrastructure/ipc/bridge.ts`
   - `frontend/src/renderer/app/runtime/*RuntimeClient*`
   - `packages/windie-sdk-js`
   - `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
   - `frontend/src/renderer/infrastructure/services/SystemCapture.ts`
   - `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
3. Keep existing desktop behavior by implementing a `DesktopRuntime` adapter that wraps current IPC channels.

Acceptance criteria:
- Desktop app behavior unchanged.
- Renderer compiles/tests with a mock runtime implementation that does not reference Electron.

### Phase 2: Backend Capability Negotiation + Mobile APIs (2-3 weeks)

Goal:
Allow backend/session behavior to adapt cleanly per client type and remove
local-runtime execution assumptions from mobile.

Implementation steps:
1. Add client capability handshake extension.
   - Example fields: `client_platform`, `tool_capabilities`,
     `supports_local_runtime`.
2. Add server-side capability filter for tool schema exposure.
   - If mobile lacks tool execution capability, backend should not expose desktop-only tool schemas.
3. Add backend conversation/memory REST APIs for mobile dashboard/history features.
   - List conversations
   - Fetch conversation transcript
   - List/delete semantic entries (if supported in hosted memory mode)
4. Update CORS/config to allow mobile origins and production domains.

Suggested files to extend:
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation (CORS policy)

Acceptance criteria:
- Mobile clients can connect without local-runtime execution assumptions.
- Tool calls incompatible with mobile are not emitted to mobile clients.
- Mobile can retrieve history via backend APIs (no sidecar dependency).

### Phase 3: Mobile App Shell + Streaming Chat (3-4 weeks)

Goal:
Ship a first working React Native client.

Implementation steps:
1. Create `mobile/` app (Expo recommended for velocity).
2. Implement `MobileRuntime` adapters:
   - WebSocket transport for backend stream.
   - Local settings store (AsyncStorage/SecureStore).
   - Artifact upload via direct HTTPS `multipart/form-data` to `/api/artifacts/`.
3. Reuse shared chat stream/store logic where possible.
4. Implement core screens:
   - Chat
   - Conversation list
   - Settings
5. Wire `update-settings`, `list-models`, `query`, and stream events.

Acceptance criteria:
- End-to-end query/streaming works on iOS + Android test devices.
- Crash-free rate and reconnect behavior meet agreed baseline.

### Phase 4: Mobile Media + Voice Foundations (2-3 weeks)

Goal:
Add mobile-native input improvements without desktop wakeword parity assumptions.

Implementation steps:
1. Add image attachment from camera/gallery and optional on-demand screenshot semantics.
2. Integrate optional microphone capture for push-to-talk (not always-on wakeword in V1 unless policy/privacy is solved).
3. Map TTS playback to backend `audio-chunk` stream if enabled.

Acceptance criteria:
- Users can send text + image context reliably.
- Voice input/output paths are stable behind a feature flag.

### Phase 5: Mobile-Safe Tooling and Policy (2 weeks)

Goal:
Prevent invalid tool invocation paths and define mobile tool evolution.

Implementation steps:
1. Introduce explicit mobile tool policy tiers:
   - `none` (chat-only)
   - `safe_read` (future: backend-only retrieval tools)
   - `extended` (future mobile-native actions)
2. Ensure parser/tool validation honors session capability + policy.
3. Add transparent UX in mobile app when a requested tool is unavailable on this client.

Acceptance criteria:
- No desktop-only tool execution attempts are sent from mobile runtime.
- Backend does not block/hang waiting for impossible mobile tool results.

### Phase 6: Beta, Hardening, and Store Readiness (2-3 weeks)

Implementation steps:
1. Add mobile telemetry and crash reporting.
2. Run soak tests for reconnect, long streams, background/foreground transitions.
3. Security hardening:
   - secure token storage
   - TLS-only endpoints
   - payload size/rate controls tuned for mobile networks
4. Prepare App Store / Play Store compliance artifacts.

Acceptance criteria:
- Beta quality gate passes.
- Build/release pipeline for iOS and Android is repeatable.

## Required Cross-Cutting Refactors

1. Share query enrichment ownership.
- Current model-facing enrichment is SDK-owned (`packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`) while Electron main still performs desktop-specific query payload normalization.
- Mobile path should either:
  - move enrichment server-side, or
  - support a shared TypeScript enrichment module that can run in both desktop and mobile runtime.

2. Extract sidecar-dependent memory UI.
- Current dashboard memory sections call sidecar IPC methods.
- Replace with backend APIs for mobile and eventually Electron-hosted mode consistency.

3. Replace global `window.ipc` assumptions.
- All renderer hooks/services should depend on runtime interfaces, not preload globals.

## Testing Strategy

### Automated

- Shared app-core unit tests for stream/tool/message reducers.
- Desktop regression tests remain green (`tests/frontend`, `tests/sidecar`, private backend tests).
- New mobile integration tests for:
  - connect/handshake
  - query streaming lifecycle
  - attachment upload + `screenshot_ref` flow
  - reconnect after app background/foreground transitions

### Manual

- iOS: foreground/background stream continuity, network handoff (Wi-Fi to cellular).
- Android: process kill/restore behavior and notification-state recovery.

## Risks and Mitigations

1. Risk: Attempting full desktop parity too early delays launch.
- Mitigation: ship companion scope first, then add capability-gated features.

2. Risk: Backend/local-runtime contract coupling causes protocol drift for
   mobile.
- Mitigation: capability negotiation + server-side schema filtering in Phase 2.

3. Risk: Memory UX regressions because memory is currently local-runtime
   storage.
- Mitigation: move history/memory retrieval to backend APIs before promising parity.

4. Risk: Voice/wakeword complexity across mobile OS restrictions.
- Mitigation: push-to-talk first; keep always-on wakeword optional and delayed.

## Definition of Done (Mobile V1)

WindieOS has a production-capable mobile client when all are true:

- Mobile app can send/receive streaming chat with backend reliably.
- Users can attach image context and receive coherent responses.
- Tool exposure is capability-safe (no desktop-only tool dead-ends).
- Conversation history is accessible from mobile without sidecar dependencies.
- iOS and Android builds pass beta quality gates and release checklists.

## Suggested Implementation Order Summary

1. Runtime abstraction in existing renderer code.
2. Backend capability negotiation + mobile history APIs.
3. React Native app using shared app core.
4. Media/voice enhancements.
5. Progressive capability expansion behind policy flags.
