---
summary: "Workflow for changing or debugging WindieOS filesystem and shell tools across backend model-visible schemas, SDK/local dispatch, Electron bridge argument shaping, local execution, process sessions, sudo policy, results, and tests."
read_when:
  - When changing or debugging `read_file`, `replace`, `run_shell_command`, `process`, `open_app`, or `wait`.
  - When a file edit, file read, shell command, background process, sudo prompt, working directory, output truncation, or local tool result behaves differently from what the model requested.
  - When deciding whether a filesystem/shell bug belongs to backend schema/policy, SDK/main tool dispatch, Electron main bridge payload shaping, local-runtime executable code, or result formatting.
title: "Filesystem and Shell Change Workflow"
---

# Filesystem and Shell Change Workflow

This workflow routes changes to WindieOS local file and terminal tools. Use it when the symptom is an agent-visible tool problem rather than a general backend, renderer, or platform issue.

The key boundary is simple: the backend owns model-facing tool names, descriptions, JSON schemas, tool policy, and tool-result ingestion. The Agent SDK runtime and Electron main relay requests and add host-local execution context. The renderer displays tool projections. The local runtime owns local execution authority, path resolution, atomic file mutation, process sessions, shell output formatting, and executable result payloads through the current local-runtime Python implementation.

## Runtime Path

```mermaid
flowchart LR
    A["Backend tool catalog and policy"] --> B["Model emits tool call"]
    B --> C["Backend streams tool-call event"]
    C --> D["Agent SDK tool router"]
    D --> E["Electron main local-runtime bridge"]
    E --> F["local_runtime_execute_tool_runtime.cjs"]
    F --> G["local_runtime_tool_args.cjs"]
    G --> H["local-runtime Python execute_tool JSON-RPC"]
    H --> I["ToolRegistry.execute_tool"]
    I --> J["filesystem/system local-runtime tool implementation"]
    J --> K["ToolResult"]
    K --> L["SDK tool-result envelope"]
    L --> M["Backend tool-result ingress and history"]
```

## Boundary Rules

- Backend schema changes live under private backend implementation, and backend policy/profile code. Do not make local-runtime Python import backend schemas for parity.
- SDK/local dispatch lives under `packages/windie-sdk-js/src/index.ts`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, and `packages/windie-sdk-js/src/tools`. It should preserve correlation, bundle semantics, formatted model content, screenshot/system-state inclusion rules, and result envelopes.
- Local-runtime executable argument models are currently backed by `frontend/src/main/python/tools/schemas.py`. Local-runtime executable implementations are currently backed by `frontend/src/main/python/tools/filesystem` and `frontend/src/main/python/tools/system`.
- `read_file` may read text, selected binary-safe formats, and paginated windows, but it must keep OCR/text extraction boundaries explicit. OCR belongs to screenshot/vision/OCR flows, not normal file reads.
- `replace` must preserve the atomic edit contract: validate input first, read existing content, compute all matches/replacements, write through a temporary file, then `os.replace`. Failed matches must not partially mutate the target.
- `run_shell_command` must keep output predictable for user display and model-facing `output`. Foreground execution returns captured stdout/stderr directly; long-running or high-volume output should use background sessions and `process`.
- `process` owns ongoing shell sessions after foreground execution yields or a command starts in the background. Do not create parallel session state in renderer or backend code.
- File/shell default-directory behavior is tied to selected workspace context. If defaults feel wrong, inspect workspace selection and permission/runtime context before changing shell or filesystem code.

## Fast Owner Map

| Symptom | First owner | Inspect first | Then inspect |
| --- | --- | --- | --- |
| Tool is missing from prompt or has the wrong argument schema | Backend tool schema/catalog | private backend implementation | [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md), backend schema tests |
| Tool is visible but never reaches local-runtime execution | SDK conversation runtime/tool coordinator or local-runtime bridge | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs` | SDK conversation-runtime tests, bridge lifecycle/RPC tests |
| `run_shell_command` uses the wrong sudo prompt behavior | Local-runtime shell implementation | `frontend/src/main/python/tools/system/shell_tool.py` | `tests/sidecar/test_shell_process_tool.py` |
| Shell command runs in the wrong directory | Local-runtime shell path resolution plus selected workspace state | `frontend/src/main/python/tools/system/shell_tool.py` | workspace-context docs/tests and bridge payload tests |
| Shell output is truncated, malformed, or missing metadata | Local-runtime shell formatter | `frontend/src/main/python/tools/system/shell_output_formatting.py`, `frontend/src/main/python/tools/system/shell_response_payloads.py` | `tests/sidecar/test_shell_output_formatting.py`, renderer message formatter tests |
| Background session cannot be polled, written to, killed, or cleared | Local-runtime process tool/session registry | `frontend/src/main/python/tools/system/process_tool.py`, `frontend/src/main/python/tools/system/shell_process_registry.py` | `tests/sidecar/test_shell_process_tool.py`, `tests/sidecar/test_shell_process_registry.py` |
| `read_file` path resolution is wrong | Local-runtime filesystem reader | `frontend/src/main/python/tools/filesystem/read_file_tool.py`, `frontend/src/main/python/tools/filesystem/file_utils.py` | selected workspace docs/tests, `tests/sidecar/test_read_file_tool.py` |
| `read_file` pagination, binary guard, PDF handling, or line truncation is wrong | Local-runtime filesystem reader | `frontend/src/main/python/tools/filesystem/read_file_tool.py` | [Filesystem Read and Replace Runtime Reference](../frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md) |
| `replace` fails to match or edits too broadly | Local-runtime replace engine | `frontend/src/main/python/tools/filesystem/replace_engine.py`, `replace_matchers.py`, `replace_patch_chunks.py` | `tests/sidecar/test_replace_engine.py`, `tests/sidecar/test_replace_tool.py` |
| `replace` writes partial content after an error | Local-runtime replace I/O wrapper | `frontend/src/main/python/tools/filesystem/replace_tool.py` | atomic write tests and temp-file cleanup tests |
| Tool result reaches UI but not backend continuation | SDK result envelope or backend result ingress | `packages/windie-sdk-js/src/index.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, private backend implementation | SDK/main local-runtime dispatch and backend tool-result ingress docs/tests |
| Backend receives a result but model history looks wrong | Backend result processing | private backend implementation | backend tool processing docs/tests |

## Change Sequence

1. Classify the tool family.
   - File reads and edits: `read_file`, `replace`.
   - Shell foreground/background execution: `run_shell_command`.
   - Session management: `process`.
   - Simple local helpers: `open_app`, `wait`, window/system helpers.

2. Decide whether the model-facing contract changes.
   - If the tool name, description, argument schema, visibility, policy gate, provider projection, or prompt-facing guidance changes, start in backend tool schema and policy docs.
   - If only local execution behavior changes while the model-facing contract stays stable, start in the local-runtime implementation and update parity/behavior tests.

3. Trace the request through the Agent SDK runtime and Electron.
   - SDK conversation runtime: `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`.
   - SDK tool coordinator: `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`.
   - Electron internal adapter: `frontend/src/main/sidecar/local_runtime_bridge.cjs`
     exposes `executeToolForBackend(...)` for SDK/main tool routing.
   - Tool execution runtime: `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`.
   - Argument mapper: `frontend/src/main/sidecar/local_runtime_tool_args.cjs`.

4. Verify local-runtime executable registration and schema.
   - Registry: `frontend/src/main/python/tools/registry.py`.
   - Exposed names: `frontend/src/main/python/tools/manifest.py`.
   - Executable args: `frontend/src/main/python/tools/schemas.py`.
   - JSON-RPC execution: `frontend/src/main/python/local_backend.py`.

5. Preserve filesystem contracts.
   - `read_file` should resolve relative paths from the selected workspace when available and from the home directory only when workspace context is missing.
   - `read_file` should preserve offset/limit pagination, line truncation, binary guards, and explicit extraction notes.
   - `replace` should require absolute paths for existing-file edits.
- Missing-file creation through `replace` should remain narrow: exactly one unconstrained operation with `old_string=''`.
- Backend `ReplaceArgs` rejects ambiguous edit-mode combinations before the
  request reaches SDK/main or local execution. A valid payload uses exactly
  one mode: `replacements` or `patch_chunks`; a single edit is a one-item
  `replacements` list.
- Multi-operation and patch-chunk edits must validate before writing.
   - No failed replacement mode should leave a partially edited file.

6. Preserve shell/process contracts.
   - `run_shell_command` must reject empty commands and fields outside the current schema.
   - Relative or omitted directories should resolve consistently with selected workspace behavior.
   - Foreground commands should honor timeout/yield behavior and clean registry entries when done.
   - Background commands should return a `session_id` and be manageable through `process`.
   - PTY behavior is best-effort and platform-aware; Windows fallback behavior must stay explicit.
   - Background-session output caps should retain enough recent context for polling and logs.
   - `process` actions should keep action-specific validation: `list`, `poll`, `log`, `write`, `send-keys`, `submit`, `paste`, `kill`, `clear`, `remove`.

7. Preserve result shape.
   - Local-runtime tools should return `ToolResult` objects or normalized compatible payloads.
   - Electron bridge should return `{ success: true, data }` or `{ success: false, error }`.
   - SDK/main payload builders should preserve `output` and avoid leaking raw screenshot fields for non-computer tools.
   - Backend result ingress should still receive a correlation-aware `tool-result` or `tool-bundle-result` payload.

8. Update docs next to behavior.
   - Update this workflow when ownership or sequencing changes.
   - Update [Filesystem and Shell Tools](filesystem_shell.md) for user-facing behavior and high-level tool semantics.
   - Update [Filesystem Read and Replace Runtime Reference](../frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md) for current local-runtime Python read/edit internals.
   - Update [Shell and Process Session Runtime Reference](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md) for current local-runtime Python shell/session internals.
   - Update [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md) when the cross-runtime path changes.
   - Update [Tool Catalog Matrix](tool_catalog_matrix.md) and [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md) when model-facing schema, policy, or visibility changes.
   - Update [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) if path authority, sudo behavior, workspace access, or local permission semantics change.

## Validation Matrix

| Change type | Focused validation |
| --- | --- |
| Backend filesystem/system schema, prompt visibility, or policy | private backend test runner |
| Backend tool dispatch/result continuation | private backend test runner |
| Local-runtime `read_file` behavior | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_read_file_tool.py` |
| Local-runtime `replace` behavior | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_replace_engine.py tests/sidecar/test_replace_tool.py` |
| Local-runtime shell/process behavior | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_shell_process_tool.py tests/sidecar/test_shell_process_registry.py tests/sidecar/test_shell_output_formatting.py` |
| Local-runtime registry/result normalization | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_tool_registry.py` |
| Electron bridge argument shaping and local tool failures | `cd frontend && npm run test -- LocalRuntimeToolArgs LocalRuntimeBridge.lifecycle` |
| SDK/main dispatch/result envelope behavior | `cd frontend && npm run test -- AgentSdkClient AgentSdkConversationRuntime RendererToolResultBoundary ToolOutputContent` |
| Tool event parsing and display projection | `cd frontend && npm run test -- DesktopChatStreamEventPayloadRuntime ChatBoxResponse ChatStreamToolHandlers` |
| Workspace default-folder behavior | Workspace tests plus the focused shell/read-file tests that exercise selected-workspace path resolution |
| Docs-only changes | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

If a listed test file has moved, search by the test stem before adding a new test. Do not skip the boundary just because one filename changed.

## Debug Playbooks

### Tool is visible but does not run

1. Confirm the backend schema includes the tool and the active policy profile exposes it.
2. Check the streamed `tool-call` event reaches the SDK/main local-runtime tool router.
3. Check `AgentClient.wakeUp(...)` provides the SDK local runtime client and `agent.conversation(...)` dispatches the local runtime call through the SDK tool coordinator.
4. Check `local_runtime_bridge.cjs` exposes `executeToolForBackend(...)`.
5. Check `local_runtime_execute_tool_runtime.cjs` sends `execute_tool` with `tool_name` and normalized `args`.
6. Check local-runtime Python `ToolRegistry.execute_tool` has the executable name registered.
7. Add or update one test at the failing boundary, then one adjacent contract test if drift is possible.

### Shell command uses the wrong sudo behavior

1. Inspect `shell_tool.py` sudo command rewriting.
2. Confirm `pkexec` is available on Linux when an OS authentication prompt is expected.
3. Cover local-runtime shell behavior with `tests/sidecar/test_shell_process_tool.py`.

### Shell process appears stuck

1. Determine whether the command was foreground, yielded, or background.
2. Use the returned `session_id` and `process` action to inspect session state.
3. Inspect `shell_process_registry.py` for TTL/cap cleanup behavior.
4. Inspect `process_tool.py` action validation and output slicing.
5. Confirm renderer/backend result continuation is not waiting on an already-yielded process session.

### File read returns surprising content

1. Confirm whether the path was absolute or relative.
2. If relative, inspect selected workspace context before changing filesystem code.
3. Inspect pagination inputs: `offset`, `limit`, and file type.
4. Inspect binary/PDF handling and extraction notes in `read_file_tool.py`.
5. Add a local-runtime Python test for the exact path-resolution or pagination case.

### Replace edits too much or not enough

1. Reproduce with the smallest old/new string, replacement operation, or patch chunk.
2. Inspect `replace_engine.py` to distinguish strict match, lenient match, occurrence index, replace-all, and patch-chunk behavior.
3. Inspect `replace_matchers.py` and `replace_patch_chunks.py` when line matching or chunk overlap is involved.
4. Confirm failed matches do not write.
5. Add engine-level tests first, then wrapper-level tests if file I/O or atomic write behavior changed.

## Related Docs

- [Filesystem and Shell Tools](filesystem_shell.md)
- [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md)
- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Tool Troubleshooting](tool_troubleshooting.md)
- [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md)
- [Local-Runtime Tools Docs Hub](../frontend/sidecar/tools/README.md)
- [Filesystem Read and Replace Runtime Reference](../frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md)
- [Shell and Process Session Runtime Reference](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md)
- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md)
