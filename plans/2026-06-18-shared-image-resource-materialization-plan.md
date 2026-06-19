---
summary: "Goal plan for converging WindieOS user attachments, query screenshots, tool screenshots, and trusted screenshot temp files onto one SDK/main-owned image resource materialization path."
title: "Shared Image Resource Materialization Plan"
---

# Shared Image Resource Materialization Plan

Date: 2026-06-18

## Goal

Create one shared image-resource materialization path for WindieOS image-like
inputs while preserving the existing source boundaries:

- user-attached images from the renderer composer
- query screenshots requested by the camera/overlay send path
- post-action screenshots captured after local computer-use tools
- trusted local-runtime screenshot temp files returned by the screenshot tool
- existing artifact refs used by replay, retry, and edit/resend flows

The foundation should be a typed SDK/main contract, not a universal filesystem
directory. Durable conversation truth remains artifact refs:
`screenshot_ref` and `screenshot_refs`.

## Desired End State

- Renderer code declares typed resources and owns preview/presentation only.
- SDK runtime owns resource resolution, artifact materialization, attachment
  metadata, and backend-compatible screenshot refs.
- SDK tool coordination uses the same materialization helper for post-action
  screenshots and explicit screenshot results.
- Electron main keeps the trust boundary for local screenshot temp paths,
  display-bounds injection, host-side screenshot invocation, and cleanup.
- Backend query, rehydrate, prompt construction, and artifact routes keep the
  current artifact-ref contracts.
- Python sidecar continues to capture screenshots and report local execution
  output without owning artifact upload or durable image state.
- No old temp path namespace, camelCase screenshot alias, or inline query
  screenshot contract is restored.

## Non-Goals

- Do not force user attachments to call the screenshot tool.
- Do not move query screenshot capture or artifact upload into renderer send
  code.
- Do not let the SDK trust arbitrary filesystem paths directly.
- Do not change backend query or rehydrate schemas back to inline screenshot
  payloads.
- Do not create one shared screenshot directory as the primary abstraction.
- Do not rewrite backend prompt image projection unless a specific duplicated
  validation bug is found there.

## Proposed Contract Shape

Use a private SDK/main-level resource shape, not necessarily a public API:

```ts
type VisualResource =
  | {
      source: 'user_attachment';
      base64: string;
      contentType?: string;
      filename?: string;
    }
  | {
      source: 'query_screenshot' | 'tool_screenshot';
      data: Record<string, unknown>;
      filename?: string;
    }
  | {
      source: 'trusted_temp_screenshot_path';
      bytes: Uint8Array;
      contentType?: string;
      filename?: string;
      captureMeta?: Record<string, unknown>;
    }
  | {
      source: 'artifact_ref';
      screenshotRef: string;
      screenshotUrl?: string;
      contentType?: string;
      captureMeta?: Record<string, unknown>;
    };
```

The materializer output should be the existing WindieOS attachment contract:

```ts
type MaterializedVisualResource = {
  screenshot_ref?: string;
  screenshot_refs?: string[];
  screenshot_url?: string;
  screenshot_content_type?: string;
  capture_meta?: Record<string, unknown>;
  attachment_filenames?: string[];
  display_metadata?: Record<string, unknown>;
};
```

Names may change during implementation. The important invariant is that all
source-specific inputs converge before backend payload assembly, while each
source keeps its trust and timing rules.

## Owner Map

| Layer | Role |
| --- | --- |
| Renderer | Keep composer previews and send typed resources only. |
| SDK runtime | Primary owner for `VisualResource` normalization and query-send materialization. |
| SDK tool coordinator | Reuse the materializer for explicit and post-action screenshot results. |
| Electron main | Own trusted temp-path validation, screenshot invocation, display-bounds injection, upload bridge, and cleanup. |
| Backend API/query | Preserve artifact-ref input contracts and existing ref normalization. |
| Backend prompt projection | Continue resolving refs into bounded provider image input at prompt time. |
| Python sidecar | Capture screenshots and return tool output; do not own artifacts. |

## Implementation Slices

### 1. Inventory and Lock Current Contracts

- Identify every current screenshot/image materialization branch in
  `DefaultTurnResourceResolvers`, `ToolExecutionCoordinator`, and Electron main
  screenshot attachment helpers.
- Add or confirm focused tests for:
  - user image resources producing `screenshot_ref` and `screenshot_refs`
  - query screenshots producing artifact refs and capture metadata
  - post-action tool screenshots capturing once
  - explicit screenshot tool avoiding duplicate capture
  - trusted temp paths rejecting old/unowned path namespaces
  - camelCase screenshot result aliases staying rejected
  - backend query/rehydrate staying artifact-ref based

### 2. Extract SDK Runtime Materializer

- Introduce a narrow SDK runtime helper for base64/artifact-ref/resource
  materialization.
- Move duplicated content-type normalization, filename selection, upload result
  shaping, and multi-ref assembly into that helper.
- Keep renderer resource shapes and backend payload shapes unchanged.
- Keep existing trace/capture metadata fields stable.

### 3. Route Query Resources Through the Helper

- Change `clipboard_image` and `query_screenshot_request` resolution to call the
  shared materializer.
- Preserve current behavior for send failure, optional query screenshot
  failure, required clipboard-image upload failure, and user-row metadata.
- Confirm edit/resend and retry preserve `screenshot_refs` and filenames.

### 4. Route Tool Screenshots Through the Helper

- Change `ToolExecutionCoordinator` screenshot result handling to reuse the same
  materialization logic where possible.
- Preserve single-action and bundle capture semantics.
- Preserve rejection of local tool result camelCase screenshot aliases.
- Preserve bundle promotion of an explicit screenshot step.

### 5. Keep Main-Process Temp Path Trust Boundary Separate

- Leave direct temp-path validation in Electron main.
- Keep the `desktop-runtime-screenshots` temp namespace strict and transient.
- Keep fallback inline behavior only where current main bridge behavior already
  allows it after artifact upload failure.
- Keep cleanup guarantees for trusted temp screenshot files.

### 6. Remove Duplication and Document the New Boundary

- Delete obsolete helper branches once all callers converge.
- Update artifact, attachment, SDK, and screenshot capture docs only where the
  owning contract changed.
- Add docs-search breadcrumbs for stale names if removed helpers had searchable
  history.

## Validation Matrix

| Slice | Focused validation |
| --- | --- |
| SDK query resource materialization | `bin/windie test frontend -- WindieSdkConversationRuntime ArtifactImageUtils` |
| Renderer resource send path | `bin/windie test frontend -- ChatMessageSender DesktopChatSendPayloadRuntime` |
| Tool screenshot materialization | `bin/windie test frontend -- WindieSdkConversationRuntime LocalRuntimeExecuteToolRuntime` |
| Main trusted temp-path bridge | `bin/windie test frontend -- LocalRuntimeExecuteToolRuntime LocalRuntimeBridge` |
| Backend artifact-ref contract | `./scripts/python-in-env.sh backend pytest tests/backend/test_query_execution_inputs.py tests/backend/test_api_handlers.py` |
| Artifact routes/store touched | `./scripts/python-in-env.sh backend pytest tests/backend/test_artifact_routes.py tests/backend/test_artifacts_store.py` |
| Docs-only slice | `./bin/windie.sh docs list`, `git diff --check` |

## Regression Guardrails

- Query and rehydrate payloads must not regain inline screenshot fields.
- Tool results must keep snake_case screenshot fields only.
- Renderer must not upload screenshots before SDK turn resolution.
- Backend prompt projection must remain bounded by prompt-image limits.
- Temp screenshot files must not become durable truth.
- Artifact refs must remain user/install scoped through existing backend routes.

## Completion Note Template

For each completed slice, record:

- what source path moved onto the shared materializer
- what duplicate branch was removed
- whether payload shape changed
- validation performed
- migration/security note, including "no migration required"

## Progress Notes

- 2026-06-18: plan created after reviewing WindieOS artifact, attachment,
  capture, SDK/main, Codex image-input, and OpenClaw media-hygiene patterns.
- 2026-06-18: extracted a private SDK `VisualResourceMaterializer` helper and
  routed renderer clipboard images, query screenshot artifact/inline payloads,
  and tool screenshot artifact/inline payloads through it. Removed the SDK
  direct file-read upload branch for raw `screenshot_path`; Electron main keeps
  the temp-path trust boundary and cleanup. Payload shape remains artifact-ref
  based; no migration required. Validation so far: SDK ESM/CJS builds and
  focused `WindieSdkConversationRuntime` screenshot/tool materialization tests.
- 2026-06-18: routed Electron main trusted temp screenshot bytes through the
  same SDK materializer by adding a `trusted_temp_screenshot_path` byte resource
  variant. Main continues to validate the owned temp namespace, read and delete
  files, attach upload auth, and fall back to inline payloads if artifact upload
  fails. Payload shape remains artifact-ref based; no migration required.
