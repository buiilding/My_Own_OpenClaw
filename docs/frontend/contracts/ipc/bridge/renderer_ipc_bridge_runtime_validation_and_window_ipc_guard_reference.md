---
summary: "Deep reference for renderer IPC bridge behavior: typed channel sets, dev-only runtime validation, preload-backed `window.ipc` dependency guard, and listener cleanup contracts."
read_when:
  - When changing `IpcBridge.send/invoke/on/once` behavior or channel constant families.
  - When debugging dev-only invalid channel exceptions versus production pass-through behavior.
title: "Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference"
---

# Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/preload.js`
- `tests/frontend/IpcBridge.test.ts`
- `tests/frontend/IpcBridgeValidation.test.ts`

## Dependency Guard (`window.ipc`)

`getRawIpc()` is the runtime dependency boundary:

- requires browser context and `window.ipc` object
- throws `"window.ipc is not available. Make sure preload.js is loaded."` when missing

Impact:

- all bridge methods (`send`, `invoke`, `on`, `once`) fail early when preload binding is absent

Test anchors:

- missing `window.ipc` cases validated in `IpcBridge.test.ts` for `invoke` and `send`.

## Typed Channel Families

Compile-time channel safety comes from `channels.ts`:

- `SendChannel` from `SEND_CHANNELS` values
- `InvokeChannel` from `INVOKE_CHANNELS` values
- `OnChannel` from `ON_CHANNELS` values

`IpcBridge` signatures use these union types to prevent typos in typed call sites.
`channels.ts` also validates the imported shared JSON registry at module load.
Missing families, missing keys, or drifted channel string values throw before
the exported channel constants can be used by renderer callers.

`bridge.ts` does not re-export channel constants. Renderer callers that need
channel names import them from `channels.ts`, while callers that need IPC
transport behavior import `IpcBridge` from `bridge.ts`.

## Runtime Validation Policy

Bridge precomputes set lookups:

- `SEND_CHANNEL_SET`
- `INVOKE_CHANNEL_SET`
- `ON_CHANNEL_SET`

Validation gate:

- active only when `process.env.NODE_ENV === 'development'`
- skipped in production to avoid redundant runtime checks

Validation errors:

- `Invalid send channel: <name>`
- `Invalid invoke channel: <name>`
- `Invalid on channel: <name>`

Test anchors:

- dev mode throws for invalid channels
- production mode permits pass-through to raw `window.ipc`

## Bridge Method Contracts

### `send(channel, data)`

- validates channel (dev only)
- forwards to `window.ipc.send(channel, data)`
- no return value

### `invoke(channel, data?)`

- validates channel (dev only)
- forwards to `window.ipc.invoke(channel, data)`
- resolves/rejects with raw preload/main response

### `on(channel, handler)`

- validates channel (dev only)
- forwards to `window.ipc.on(channel, handler)`
- returns cleanup function from preload bridge

### `once(channel, handler)`

- validates channel (dev only)
- forwards to `window.ipc.once(channel, handler)`

## Preload Boundary Relationship

`IpcBridge` is not the security boundary.

Actual enforce boundary:

- preload allowlist in `preload.js`

Implication:

- production bypass of bridge validation remains safe because preload still rejects/ignores non-allowlisted channels

## Listener Cleanup Semantics

`IpcBridge.on(...)` returns whatever preload `on` returns.

Expected usage:

- caller stores returned function
- caller executes function on unmount/dispose to remove listener

If cleanup ignored:

- listeners accumulate
- duplicate event handling possible

## Drift Hotspots

1. adding new channel constant without preload allowlist update causes production invoke rejections.
2. editing `ipcChannels.json` without keeping the renderer expected key lists aligned now fails at module load.
3. changing validation environment check can unintentionally enable/disable dev checks.
4. altering `getRawIpc` error semantics can break test diagnostics and runtime onboarding hints.
5. forgetting to return cleanup function from preload `on` path breaks renderer unsubscription contract.
6. re-exporting channel constants from `bridge.ts` recreates a duplicate owner path for channel names.

## Change Checklist

When changing bridge/runtime validation:

1. keep compile-time channel unions aligned with `channels.ts`
2. keep the expected key lists in `channels.ts` and `ipcChannels.json` synchronized
3. keep dev/prod validation behavior explicit and documented
4. preserve preload as authoritative allowlist boundary
5. verify missing-`window.ipc` error remains actionable
6. run `IpcBridge` and `IpcChannels` test suites
