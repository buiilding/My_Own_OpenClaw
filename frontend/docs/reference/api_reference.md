---
summary: "API Reference"
read_when:
  - When integrating backend APIs or client calls.
---

# API Reference

## Overview

WindieOS uses a hosted backend control plane with:

- WebSocket for real-time agent/session communication
- HTTP for artifacts, SDK perception APIs, and memory services

The intended SDK split is:

- call the backend for backend-owned capabilities such as OCR, vision/prediction, artifacts, and agent APIs
- call the SDK local runtime for machine-touching capabilities such as screenshot, click, type, browser/runtime control, files, and processes

SDK consumers should not need to start a local runtime process just to use hosted OCR or prediction routes.

The canonical TypeScript SDK surface is the standalone `@windie/sdk` package in
`packages/windie-sdk-js`. The desktop and local-runtime Python trees expose first-class
package entrypoints for their runtime boundary:

- `frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts.ts` (Electron renderer app-runtime conversation contracts facade)
- `frontend/src/main/python/windie/sdk.py` (Python)

These clients talk only to the public backend surfaces documented here:

- HTTP: `/api/artifacts/*`, `/api/sdk/*`
- WebSocket: `/ws`

The Electron renderer app consumes the TypeScript SDK package through focused
app-runtime facades, while the Python package exports `AgentSdkClient` from
`windie`. The hosted SDK clients are intentionally separate from the
first-party Electron renderer app-runtime facades, which adapt SDK and hosted
transport contracts for the desktop UI and IPC boundary.

Backend message dispatch is handled by `MessageHandlerRegistry` in `backend/src/api/infrastructure/registry.py`.

## WebSocket Endpoint

**URL**: hosted default `wss://api.windieos.com/ws`

Electron clients may override this via:
- `BACKEND_WS_URL` (explicit WebSocket URL)
- `BACKEND_HTTP_URL` (WebSocket derived as `/ws`)
- `BACKEND_HOST` + `BACKEND_PORT`

Local development or self-hosted deployments may use `ws://127.0.0.1:8765/ws`.

**Protocol**: WebSocket (RFC 6455)

**Connection**: Persistent connection, auto-reconnect on disconnect

### Handshake (Required)

The client must send a handshake message immediately after connecting.
This message does **not** use the base message envelope.
For hosted deployments, the socket must also include
`Authorization: Bearer <install_token>`. The backend authenticates that token,
derives the real `user_id` server-side, and ignores any mismatched client-claimed
`user_id` in the handshake payload. Local/self-hosted deployments may still run
without install auth when explicitly configured that way.

Handshake validation behavior:
- Invalid handshake JSON or invalid handshake schema closes the socket with policy-violation code `1008`.
- Handshake JSON parsing follows the shared WebSocket parse policy:
  - small payloads parse inline,
  - payloads >= `64 KiB` are offloaded to the thread pool to avoid blocking the event loop.

**Payload**:
```json
{
  "type": "handshake",
  "user_id": "user-123",
  "agent_definition": {
    "version": 1,
    "tools": {
      "mode": "explicit",
      "available_tools": [
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "browser",
        "web_search"
      ],
      "disabled_tools": ["browser"],
      "disabled_capabilities": ["ocr", "vision"]
    },
    "runtime": {
      "operating_system": "macOS",
      "coordinate_methods": ["manual"]
    }
  }
}
```

`agent_definition` is optional. If provided, the backend applies its tool and
runtime fields as session-scoped policy inputs before the first query:
- `agent_definition.tools.available_tools`: tool names this client/runtime can satisfy or expects the backend to provide for this session
- `agent_definition.tools.disabled_tools`: direct tool names requested off
- `agent_definition.tools.disabled_capabilities`: `ocr`, `vision`, `embeddings`, `web_search`, or `browser`
- `agent_definition.runtime.coordinate_methods`: optional coordinate grounding methods used only as a narrowing input for specialized clients
- `agent_definition.runtime.operating_system`: optional runtime OS used when rendering the session prompt

The backend treats these as narrowing inputs. Server policy and interaction
mode still apply after handshake negotiation. Removed top-level handshake fields
such as `operating_system`, `available_tools`, `available_coordinate_methods`,
and `requested_agent_policy` are rejected; websocket clients must send the
canonical `agent_definition` shape. No persisted-data migration is required.
OCR, vision, prediction, web search, and paid capability availability are
backend-owned; clients cannot unlock them by sending handshake fields.

### Install Registration (Hosted)

Hosted Electron clients bootstrap identity with a no-login registration call.
The returned install token is stored locally and reused for subsequent REST and
WebSocket calls.

### POST `/api/install/register`

**Request**:
```json
{ "operating_system": "Windows" }
```

**Response**:
```json
{
  "success": true,
  "user_id": "user_123",
  "install_id": "install_123",
  "install_token": "wnd_install_..."
}
```

## Dedicated Transcription WebSocket

Local STT capture uses a separate websocket with a smaller protocol than the main `/ws` agent channel.

**URL**: hosted default `wss://api.windieos.com/ws/transcription`

Electron clients derive this from the active backend HTTP endpoint (`BACKEND_HTTP_URL`) by replacing the path with `/ws/transcription`.

Local development or self-hosted deployments may use `ws://127.0.0.1:8765/ws/transcription`.

**Protocol**: WebSocket (RFC 6455)

**Handshake**: none beyond normal websocket accept

**Renderer -> backend messages**:

- text control:
  - `{"type":"set_langs","source_language":"en","target_language":"en"}`
  - `{"type":"start_over"}`
- binary audio frames:
  - 4-byte little-endian metadata length
  - JSON metadata (`{"sampleRate":16000}`)
  - PCM16 audio payload

**Backend -> renderer messages**:

- `status`
```json
{ "type": "status", "client_id": "uuidhex" }
```
- `realtime`
```json
{ "type": "realtime", "text": "partial or final transcript", "is_final": true | false }
```
- `utterance_end`
```json
{ "type": "utterance_end" }
```
- `error`
```json
{ "type": "error", "message": "string" }
```

Provider note:

- Nova mode proxies to the configured Nova gateway.
- OpenAI mode connects to the realtime websocket using `openai_realtime_session_model` and then sends `session.update` with `openai_realtime_transcription_model`.

## HTTP Endpoints (Memory)

These REST endpoints live on the same FastAPI server as the WebSocket. In the default product topology that means the hosted backend at `https://api.windieos.com`; local or self-hosted deployments may instead use `http://127.0.0.1:8765`.

They are used by local-runtime Python for embeddings, semantic summarization, and async conversation-title generation.

Hosted requests on `/api/*` require `Authorization: Bearer <install_token>`
except for `/api/install/register`.

### POST `/api/embeddings/`

Generate an embedding for a single text input.

**Request**:
```json
{ "text": "string", "model_name": "default" }
```

**Limits**: `text` max 8192 chars, `model_name` max 128 chars.

**Response**:
```json
{
  "embedding": [0.0, 0.1, ...],
  "provider_id": "local-sentence-transformer",
  "model_id": "sentence-transformers/all-MiniLM-L6-v2",
  "model_name": "sentence-transformers/all-MiniLM-L6-v2",
  "dimension": 384,
  "embedding_space_version": "local-sentence-transformer:sentence-transformers/all-MiniLM-L6-v2:384"
}
```

### GET `/api/embeddings/health`

Health check for the embeddings service.

**Response**:
```json
{
  "status": "healthy",
  "provider_id": "local-sentence-transformer",
  "model_id": "sentence-transformers/all-MiniLM-L6-v2",
  "model_name": "sentence-transformers/all-MiniLM-L6-v2",
  "dimension": 384,
  "embedding_space_version": "local-sentence-transformer:sentence-transformers/all-MiniLM-L6-v2:384"
}
```

### Internal Embedding Service

The hosted backend can also delegate embeddings to a separate internal service
when `embedding_backend=remote-http`.

**Routes**:
- `GET /health`
- `POST /embed`

`POST /embed` is an internal service route. It requires
`x-windie-embedding-key: <WINDIE_EMBEDDING_SERVICE_API_KEY>` and fails closed
when the key is missing from service configuration.

`POST /embed` accepts 1..256 text strings. Each text is capped at 8192
characters and the total request is capped at 65536 characters before provider
execution.

**Embed response**:
```json
{
  "embeddings": [[0.0, 0.1, ...]],
  "provider_id": "embedding-service",
  "model_id": "sentence-transformers/all-MiniLM-L6-v2",
  "model_name": "sentence-transformers/all-MiniLM-L6-v2",
  "dimension": 384,
  "embedding_space_version": "embedding-service:sentence-transformers/all-MiniLM-L6-v2:384",
  "queue_wait_ms": 0.4,
  "service_time_ms": 12.7
}
```

### POST `/api/semantic/summarize`

Summarize episodic conversations into semantic memory.

**Request**:
```json
{ "conversations": ["..."], "user_id": "user-123" }
```

**Limits**: up to 100 conversations; each conversation max 32KB; `user_id` cannot be `default_user`.

**Response**:
```json
{ "summary": "string", "facts": ["..."], "success": true }
```

### POST `/api/semantic/title`

Generate a short conversation title from the first user and assistant turn.

**Request**:
```json
{
  "user_id": "user-123",
  "user_message": "string",
  "assistant_message": "string",
  "model_id": "optional-override",
  "model_provider": "optional-provider-override"
}
```

**Limits**: `user_message` max 32KB; `assistant_message` max 32KB; `user_id` cannot be `default_user`.

**Response**:
```json
{ "title": "string", "success": true }
```

### GET `/api/semantic/health`

Health check for semantic summarization.

**Response**:
```json
{ "status": "healthy", "message": "Semantic summarization service ready" }
```

## HTTP Endpoints (Artifacts)

Large artifacts (screenshots, snapshots) are uploaded over HTTP and referenced by ID in WebSocket payloads.

### POST `/api/artifacts/`

Upload an artifact (multipart/form-data).

**Request**:
- `file`: binary file upload

**Response**:
```json
{
  "artifact_id": "uuid.jpg",
  "content_type": "image/jpeg",
  "size_bytes": 123456,
  "sha256": "hex",
  "url": "http://127.0.0.1:8765/api/artifacts/uuid.jpg"
}
```

### GET `/api/artifacts/{artifact_id}`

Fetch an artifact by ID (binary response).

## HTTP Endpoints (SDK Perception)

These REST endpoints expose backend-owned perception and grounding capabilities directly for SDK consumers.
They bypass the agent loop and operate on either uploaded artifact IDs or inline base64 image payloads.
The intended usage pattern is:

1. capture or provide an image locally
2. upload it to `/api/artifacts/` or send it inline
3. call `/api/sdk/ocr/*` or `/api/sdk/vision/*`
4. use the returned bbox/center/candidate data to drive a local runtime action if needed

These routes are for hosted backend use. They are not meant to require SDK consumers to spin up a local runtime process just to resolve OCR or prediction.

### TypeScript Client Example

```ts
import { AgentClient, moduleTool } from '@windie/sdk';

const client = new AgentClient({
  backendUrl: 'https://backend.example.com',
});

const agent = await client.wakeUp({
  userId: 'dev-user',
  systemPrompt: 'You are a concise coding agent.',
  workspacePath: '/Users/me/project',
  tools: [
    moduleTool({
      name: 'save_note',
      module: 'my_project.tools:save_note',
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
    }),
  ],
});

agent.session.on('tool-schemas', event => {
  console.log(event.payload?.tool_schemas);
});

await agent.ask('Click the orange search button', {
  conversationRef: 'conv_123',
  screenshotRef: 'shot.png',
});
```

### Python Client Example

```python
from windie import AgentSdkClient

sdk = AgentSdkClient(
    backend_url="https://backend.example.com",
    default_user_id="dev-user",
)

prompt = await sdk.get_system_prompt()
tool_schemas = await sdk.get_tool_schemas()
query_plan = await sdk.get_query_plan(
    {
        "user_query_raw": "open file",
        "conversation_ref": "conv_sdk",
        "messages": [],
    }
)

agent = await sdk.wake_up(
    system_prompt="You are a concise coding agent.",
    workspace_path="/Users/me/project",
    tools=[
        {
            "name": "save_note",
            "module": "my_project.tools:save_note",
            "schema": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
        }
    ],
)
message_id = await agent.query(
    text="Summarize the repo instructions.",
    conversation_ref="conv_python_sdk",
)
```

Agent runtime notes:

- TypeScript agent sessions should be created through `AgentClient.wakeUp(...)`.
- Python agent sessions should use `AgentSdkClient.wake_up(...)`; local module
  tools, plugins, and MCP servers are registered with the same local-runtime daemon
  contract used by the TypeScript runtime.

Shared image input shape:

```json
{
  "image": {
    "artifact_id": "optional-uploaded-image.png",
    "image_base64": "optional-inline-base64-or-data-url"
  }
}
```

Exactly one of `artifact_id` or `image_base64` is required.

### POST `/api/sdk/ocr/run`

Run OCR on the provided image and return normalized OCR rows.

**Request**:
```json
{
  "image": { "artifact_id": "shot.png" }
}
```

**Response**:
```json
{
  "image": {
    "source_id": "shot.png",
    "artifact_id": "shot.png",
    "content_type": "image/png",
    "width": 1440,
    "height": 900
  },
  "results": [
    {
      "id": "0",
      "text": "Search Amazon",
      "confidence": 0.99,
      "bbox": { "x": 500, "y": 216, "width": 174, "height": 36 },
      "center": { "x": 587, "y": 234 },
      "candidate_id": "ocr_deadbeef1234",
      "score": null
    }
  ]
}
```

### POST `/api/sdk/ocr/inspect`

Return an OCR observability bundle for developer SDK consumers.

This route is meant to extend the existing OCR SDK surface rather than create a
separate debugging subsystem. It combines:

- normalized OCR rows
- ranked fuzzy matches for a query
- accepted matches above threshold
- single-target resolution result when possible
- structured resolution error when resolution fails
- optional saved overlay artifact

**Request**:
```json
{
  "image": { "artifact_id": "shot.png" },
  "text": "Search Amazon",
  "threshold": 0.8,
  "max_results": 10,
  "include_overlay": true,
  "show_labels": true
}
```

**Response notes**:

- `results`: all normalized OCR rows
- `ranked_matches`: top fuzzy matches for `text`
- `accepted_matches`: matches whose score meets `threshold`
- `resolved_match`: the single resolved target when disambiguation succeeds
- `resolution_error`: structured `status_code` plus `detail` when expected single-target resolution fails; unexpected resolver/runtime errors return as route errors
- `overlay`: optional saved artifact when `include_overlay=true`

### POST `/api/sdk/ocr/find-text`

Return OCR rows whose fuzzy match score meets the requested threshold.

**Request**:
```json
{
  "image": { "artifact_id": "shot.png" },
  "text": "Search Amazon",
  "threshold": 0.8,
  "max_results": 10
}
```

### POST `/api/sdk/ocr/find-text-candidates`

Return ranked OCR candidate rows for a query, including lower-scoring fuzzy matches.
This is the disambiguation-friendly companion to `find-text`.

### POST `/api/sdk/ocr/resolve-text`

Resolve one OCR text query to a single actionable target. Current semantics match WindieOS’s internal OCR grounding path: the returned click point is the center of the matched OCR bounding box.

**Success response**:
```json
{
  "image": { "source_id": "shot.png", "artifact_id": "shot.png", "content_type": "image/png", "width": 1440, "height": 900 },
  "query": "Search Amazon",
  "threshold": 0.8,
  "match": {
    "id": "0",
    "text": "Search Amazon",
    "confidence": 0.99,
    "bbox": { "x": 500, "y": 216, "width": 174, "height": 36 },
    "center": { "x": 587, "y": 234 },
    "candidate_id": "ocr_deadbeef1234",
    "score": 1.0
  }
}
```

**Failure behavior**:
- ambiguous text matches return `409`
- missing text returns `404`
- error payload includes `resolver_payload` when the backend can surface candidate choices

### POST `/api/sdk/ocr/resolve-candidate`

Resolve a previously returned OCR `candidate_id` to its exact bbox and center in the provided image.

### POST `/api/sdk/ocr/overlay`

Render OCR annotations onto the source image and save the overlay as a first-class artifact.

Requires an authenticated install identity before image resolution or OCR work.

**Response**:
```json
{
  "image": {
    "source_id": "shot.png",
    "artifact_id": "shot.png",
    "content_type": "image/png",
    "width": 1440,
    "height": 900
  },
  "artifact_id": "overlay.png",
  "content_type": "image/png",
  "size_bytes": 34567,
  "sha256": "hex",
  "url": "http://127.0.0.1:8765/api/artifacts/overlay.png",
  "annotation_count": 3
}
```

### POST `/api/sdk/vision/locate`

Use the configured vision grounding model to predict one visual target point from a natural-language description.

**Request**:
```json
{
  "image": { "artifact_id": "shot.png" },
  "description": "orange search button on the right side of the search bar"
}
```

### POST `/api/sdk/vision/locate-all`

Return a ranked list of visual matches. Current backend support returns the best predicted match as a one-item list.

### POST `/api/sdk/vision/describe`

Describe the full image or an optional cropped region for automation/debugging.
When `region` is present, the backend crops before passing the image to the
vision model. Region origins outside the source image are rejected with `422`.
Regions that start inside the image but extend past the image edge are trimmed,
and the response reports cropped-image metadata with `region` normalized to
`{ "x": 0, "y": 0, "width": cropped_width, "height": cropped_height }`.

**Request**:
```json
{
  "image": { "artifact_id": "shot.png" },
  "region": { "x": 20, "y": 10, "width": 300, "height": 90 }
}
```

### POST `/api/sdk/vision/overlay`

Render predicted points and/or regions onto the source image and save the overlay as an artifact.
This is intended for SDK inspectors and debugging tools.

## HTTP Endpoints (SDK Introspection)

These routes expose backend-owned debug and introspection state for developer SDK consumers.
They are meant for backend-aware debugging tools and local developer workflows that need to inspect
what the backend would send to the model without relying on the desktop renderer UI.

Current scope:

- effective model/config snapshot
- discovered model catalog
- canonical tool schemas and provider-projected tool schemas
- per-tool capability metadata
- rendered system prompt
- prompt preview including the full user-message transparency payload
- query-plan preview including the first-turn `query` envelope shape and transparency events

### GET `/api/sdk/models`

Return the current model catalog plus the effective config snapshot used for the request.

Optional query params:

- `user_id`: use the active session config for that user when available
- `model_id`: override `selected_model_id` in the response snapshot
- `model_provider`: override `model_provider` in the response snapshot
- `interaction_mode`: override `interaction_mode` in the response snapshot

### GET `/api/sdk/tool-schemas`

Return both:

- `canonical_tool_schemas`: backend canonical flat tool specs before policy pruning or provider transport adaptation
- `provider_tool_schemas`: prompt-visible tool specs after backend policy pruning and provider-facing projection/adaptation

This is useful because the backend currently has both internal canonical tool objects and
provider-facing projected tool payloads in play.

### GET `/api/sdk/tool-capabilities/{tool_name}`

Return:

- backend capability metadata for one tool
- that tool’s canonical schema when available
- that tool’s provider-facing projected schema when available

`provider_tool_schema` reflects the provider-facing tool declaration for that logical
tool after provider filtering/projection. For desktop tools, this now matches the
canonical function-tool contract for OpenAI as well.

### GET `/api/sdk/system-prompt`

Return the rendered backend system prompt plus the effective config snapshot used to resolve it.

### POST `/api/sdk/prompt-preview`

Build a backend prompt preview without executing the agent loop.

Requires an authenticated install identity. If `user_id` is supplied, it must
match the authenticated identity; cross-user prompt previews are rejected.

**Request**:
```json
{
  "user_id": "optional-session-user",
  "model_id": "optional-model-override",
  "model_provider": "optional-provider-override",
  "interaction_mode": "agent",
  "include_tools": true,
  "workspace_path": "/absolute/workspace/path",
  "user_query_raw": "open file",
  "messages": [
    {
      "role": "user",
      "content": "<system_context><active_window>Terminal</active_window></system_context>\n<user_query>open file</user_query>"
    }
  ]
}
```

**Response**:
```json
{
  "config": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
    "interaction_mode": "agent"
  },
  "system_prompt": "You are a helpful assistant...",
  "prompt_messages": [
    {
      "role": "user",
      "content": "<system_context>...</system_context>\n<user_query>open file</user_query>"
    }
  ],
  "canonical_tool_schemas": [
    {
      "type": "function",
      "name": "read_file",
      "parameters": { "type": "object" }
    }
  ],
  "provider_tool_schemas": [
    {
      "type": "function",
      "name": "read_file",
      "parameters": { "type": "object" }
    }
  ],
  "user_message_full": {
    "content": "<system_context>...</system_context>\n<user_query>open file</user_query>",
    "metadata": {
      "original_query": "open file",
      "context_type": "initial",
      "injected_context": "<system_context>...</system_context>",
      "active_window": "Terminal"
    }
  },
  "prompt_token_count": 1234,
  "token_count_error": null
}
```

Notes:

- `prompt_messages` is the model-facing message list after repo-instruction injection and prompt construction.
- `user_message_full` mirrors the transparency payload emitted on the first agent iteration.
- `prompt_token_count` is best-effort; if token counting fails, `token_count_error` is populated instead.

### POST `/api/sdk/query-plan`

Build a first-turn SDK planning snapshot without executing the agent loop.

This route is a transport-facing companion to `prompt-preview`. It returns:

- a planned `query_message` shape that mirrors the WebSocket `query` envelope payload a client would send
- the ordered first-turn transparency events a client should expect before normal model streaming
- the same prompt/system/tool preview metadata exposed by `prompt-preview`

**Request**:
```json
{
  "user_query_raw": "open file",
  "conversation_ref": "conv_sdk",
  "workspace_path": "/absolute/workspace/path",
  "include_tools": true,
  "messages": [
    {
      "role": "user",
      "content": "<system_context><active_window>Terminal</active_window></system_context>\n<user_query>open file</user_query>"
    }
  ]
}
```

**Response**:
```json
{
  "config": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
    "interaction_mode": "agent"
  },
  "query_message": {
    "type": "query",
    "payload": {
      "text": "open file",
      "conversation_ref": "conv_sdk",
      "workspace_path": "/absolute/workspace/path"
    }
  },
  "transparency_events": [
    {
      "type": "system-prompt",
      "payload": {
        "content": "You are a helpful assistant..."
      }
    },
    {
      "type": "user-message-full",
      "payload": {
        "content": "<system_context>...</system_context>\n<user_query>open file</user_query>",
        "metadata": {
          "original_query": "open file",
          "context_type": "initial",
          "injected_context": "<system_context>...</system_context>",
          "active_window": "Terminal"
        }
      }
    },
    {
      "type": "tool-schemas",
      "payload": {
        "tool_schemas": [
          {
            "type": "function",
            "name": "read_file",
            "parameters": { "type": "object" }
          }
        ]
      }
    }
  ],
  "system_prompt": "You are a helpful assistant...",
  "prompt_messages": [],
  "canonical_tool_schemas": [],
  "provider_tool_schemas": [],
  "user_message_full": null,
  "prompt_token_count": 1234,
  "token_count_error": null
}
```

Notes:

- `query_message` is a client-planning preview and is not automatically dispatched.
- `transparency_events` uses the same event types and payload shape the backend emits on the first agent iteration.
- `tool-schemas` in `transparency_events` is the canonical transparency payload, while `provider_tool_schemas` remains the provider-projected model-facing tool list.

## HTTP Endpoints (Runs / VM Control)

These endpoints provide a hosted control-plane contract for web dashboards that drive VM-backed Windie execution.
Current implementation is an in-memory backend registry designed for demo/runtime integration.

Every runs endpoint requires a configured backend key and matching request header:

```http
x-windie-runs-key: <shared-key>
```

If `WINDIE_RUNS_API_KEY` is not configured, the runs API returns HTTP `503`.

### POST `/api/runs/`

Create a new run request for a workspace/agent.

**Request**:
```json
{
  "workspace_id": "workspace-demo",
  "agent_id": "agent-alpha",
  "query": "apply this internship job for me",
  "requested_by": "user_123",
  "files": [
    {
      "artifact_id": "resume-uuid.pdf",
      "filename": "resume.pdf",
      "content_type": "application/pdf"
    }
  ],
  "metadata": {}
}
```

**Response**:
- `run`: run state (`status`, `control_mode`, `conversation_ref`, worker binding fields)
- `events`: initial event list (includes `run-created`)

If workspace active-run cap is reached (`WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`, default `1`), returns `409`.

### GET `/api/runs/{run_id}`

Fetch latest run state by ID.

### GET `/api/runs/{run_id}/events?after_seq=0&limit=200`

Poll incremental run events.

**Response**:
```json
{
  "run_id": "run-uuid",
  "events": [
    {
      "seq": 2,
      "timestamp": "2026-03-03T16:00:00Z",
      "event_type": "worker-heartbeat",
      "source": "worker",
      "payload": {}
    }
  ],
  "next_after_seq": 2
}
```

### POST `/api/runs/workers/heartbeat`

Worker registration + heartbeat polling endpoint.
Returns one assigned run (if available) and any queued control commands for that worker.

**Request**:
```json
{
  "workspace_id": "workspace-demo",
  "worker_id": "worker-1",
  "vm_id": "vm-1",
  "user_id": "vm-user-1",
  "session_id": "session-1",
  "status": "ready",
  "metadata": {}
}
```

**Response**:
```json
{
  "worker": {
    "worker_id": "worker-1",
    "workspace_id": "workspace-demo",
    "vm_id": "vm-1",
    "user_id": "vm-user-1",
    "session_id": "session-1",
    "status": "ready",
    "metadata": {},
    "last_heartbeat_at": "2026-03-03T16:00:00Z"
  },
  "assigned_run": {
    "run_id": "run-uuid",
    "workspace_id": "workspace-demo",
    "conversation_ref": "run-run-uuid",
    "query": "apply this internship job for me",
    "files": [],
    "metadata": {},
    "control_mode": "agent_only"
  },
  "control_commands": []
}
```

### POST `/api/runs/{run_id}/control`

Apply run control actions.

**Request**:
```json
{
  "action": "pause",
  "requested_by": "user_123"
}
```

Supported `action` values:
- `pause`
- `resume`
- `stop`
- `set-control-mode` (requires `control_mode`: `agent_only | shared_control | human_override`)

### POST `/api/runs/stop-all`

Emergency stop for all active runs (optionally workspace-scoped).

**Request**:
```json
{
  "workspace_id": "workspace-demo",
  "requested_by": "operator"
}
```

**Response**:
```json
{
  "workspace_id": "workspace-demo",
  "stopped_run_ids": ["run-1", "run-2"],
  "count": 2
}
```

### POST `/api/runs/{run_id}/worker-dispatched`

Worker acknowledges query dispatch for an assigned run and records `turn_ref`.

**Request**:
```json
{
  "worker_id": "worker-1",
  "user_id": "vm-user-1",
  "turn_ref": "turn-uuid",
  "conversation_ref": "run-run-uuid"
}
```

### POST `/api/runs/{run_id}/events`

Worker relays backend stream events into run timeline.

**Request**:
```json
{
  "event_type": "tool-call",
  "source": "worker-stream",
  "payload": {
    "payload": {},
    "conversation_ref": "run-run-uuid",
    "turn_ref": "turn-uuid"
  }
}
```

## Message Format

### Base Message Structure

Applies to all messages **after** the handshake.

All messages follow this structure:

```json
{
  "id": "uuid-v4",
  "type": "message-type",
  "payload": { ... }
}
```

**Fields**:
- `id`: Unique message identifier (UUID v4)
- `type`: Message type (see Message Types)
- `payload`: Message-specific payload

**Notes**:
- `user_id` is injected server-side from the handshake connection context (client-provided, validated at handshake).
- `timestamp` is optional and ignored by the backend if present.
- Unknown top-level envelope fields are rejected.
- Incoming schema source lives in `backend/src/api/schemas/` (`common.py`, `incoming.py`, `outgoing.py`) and production code imports that package directly.

## Client Messages (SDK/Main -> Backend)

### Query Message

Send a user query with optional screenshot.

**Type**: `query`

**Payload**:
```json
{
  "text": "User query text",
  "conversation_ref": "conv_123",
  "content": "<episodic_memory>...</episodic_memory><semantic_memory>...</semantic_memory><user_query>...</user_query>", // Optional, built by Electron main process
  "screenshot_ref": "uuid.jpg", // Optional artifact id
  "screenshot_refs": ["uuid.jpg"], // Optional ordered artifact ids
  "system_state_internal": { "screen_resolution": "1920x1080" } // Optional backend-only runtime state
}
```

**Response**: Streaming response with multiple message types:
- `streaming-response`: Text chunks
- `tool-call`: Tool execution requests
- `tool-output`: Tool execution results
- `tool-bundle`: Atomic bundle of tools (single message)
- `llm-thought`: Thinking tokens (Gemini)
- `streaming-complete`: End of stream
- `wakeword-greeting`: Wakeword detection greeting
- `system-prompt`: System prompt for transparency
- `user-message-full`: Full user message for transparency
- `assistant-message-full`: Full assistant message for transparency
- `tool-schemas`: Tool schemas for transparency
- `token-count`: Token usage information

**Note**: The Electron main process sends structured `query_context` for memory
sections and optional attachment context while preserving legacy `content`
compatibility for other clients.
`conversation_ref` is required and identifies the active transcript/session thread.
`system_state_internal` is backend-only runtime state and is not model-facing prompt/tool-output content.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "query",
  "payload": {
    "text": "Click the submit button",
    "conversation_ref": "conv_123",
    "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Rehydrate Conversation Message

Rebuild backend in-memory conversation history from SDK conversation snapshot entries.
Used when switching or resuming conversations from the SDK/local conversation store.

**Type**: `rehydrate-conversation`

**Payload**:
```json
{
  "conversation_ref": "conv_123",
  "messages": [],
  "model_history": {
    "checkpoint_id": "mh:rev_123:turn_456",
    "revision_id": "rev_123",
    "created_at": "2026-06-22T12:00:00Z",
    "rows": [
      {
        "id": "mh-row-1",
        "conversation_ref": "conv_123",
        "revision_id": "rev_123",
        "role": "user",
        "message_type": "user_query",
        "content": "Earlier prompt"
      }
    ]
  },
  "rehydrate_mode": "replace",
  "workspace_path": "/Users/example/project",
  "repo_instruction_messages": []
}
```

Fallback `messages` shape when no model-history checkpoint exists:

```json
{
  "conversation_ref": "conv_123",
  "messages": [
    {
      "role": "user",
      "content": "Earlier prompt",
      "message_type": "user_query",
      "timestamp": "2026-02-02T20:00:00Z",
      "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg"
    },
    {
      "role": "assistant",
      "content": "Earlier reply",
      "message_type": "assistant_response",
      "timestamp": "2026-02-02T20:00:01Z"
    }
  ],
  "rehydrate_mode": "replace",
  "workspace_path": "/Users/example/project",
  "repo_instruction_messages": []
}
```

**Message entry fields**:
- `role`: `user | assistant | tool`
- `content`: message text/content
- `message_type`: optional canonical stored message type (`user_query`, `assistant_response`, `tool_output`, or `context_compaction`)
- `tool_name`: optional tool name (tool entries)
- `correlation_id`: optional call correlation id
- `timestamp`: optional timestamp
- `screenshot_ref`: optional artifact id
- `workspace_path`: optional workspace binding for resumed conversation context
- `repo_instruction_messages`: optional contextual repo-instruction messages

**Behavior**:
- Backend prefers `model_history` and installs those provider-neutral rows
  directly into session history.
- When `model_history` is absent, backend replaces session history for
  `conversation_ref` with the fallback message list.
- For fallback entries with `screenshot_ref`, backend attempts artifact lookup
  and inlines base64 for model history.
- If artifact lookup fails, backend logs a warning and continues fallback
  rehydrate with `image_data=None` for that entry (text history still restored).

**Response**:
- Success: no dedicated success event (rehydrate is applied silently).
- Failure: standard `error` event.

### Client Tool Manifest Handshake

Client-local tool schemas are sent during websocket handshake inside
`agent_definition.tools.client_manifest`. The backend validates the manifest,
stores accepted/rejected diagnostics on the session, applies tool policy and
provider projection, and emits the public validation result as
`client-tool-manifest`.

Current SDK/Electron clients should not send a separate post-handshake client
tool-schema sync message. Client-local tool manifests must be nested under
`agent_definition.tools.client_manifest`.

**Handshake excerpt**:
```json
{
  "type": "handshake",
  "user_id": "user-123",
  "agent_definition": {
    "version": 1,
    "tools": {
      "mode": "default_plus_client",
      "client_manifest": {
        "version": 1,
        "tools": [
          {
            "name": "read_file",
            "description": "Read a UTF-8 text file from disk",
            "execution_target": "local_runtime",
            "schema": {
              "type": "object",
              "properties": {
                "path": { "type": "string" }
              },
              "required": ["path"]
            },
            "argument_resolution": "passthrough"
          }
        ]
      }
    }
  }
}
```

### Load Settings Message

Request current application settings.

**Type**: `load-settings`

**Payload**: `{}`

**Response**: `settings-loaded`

**Status**: Handled by the backend. Returns client settings from the active session config (or global defaults if no session exists). Provider API key entries are included only in redacted form; raw `api_key` values are never returned by this response.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174001",
  "type": "load-settings",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Update Settings Message

Update application configuration.

**Type**: `update-settings`

**Payload**:
```json
{
  "model_mode": "online" | "local",
  "model_provider": "openai" | "anthropic" | ...,
  "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
  "interaction_mode": "chat" | "agent",
  "speech_mode_enabled": true | false,
  "wakeword_enabled": true | false,
  "wakeword_stt_enabled": true | false,
  "browser_automation_enabled": true | false,
  "include_query_screenshot": true | false,
  "provider_api_keys": { ... }
}
```

**Response**: `settings-updated`

**Status**: Handled by the backend. Updates apply to the user session on the next query.
Payload shape is validated at message-parse time; value semantics are validated in backend settings validators.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "type": "update-settings",
  "payload": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
    "interaction_mode": "chat",
    "speech_mode_enabled": true,
    "wakeword_enabled": true,
    "wakeword_stt_enabled": false,
    "browser_automation_enabled": true,
    "include_query_screenshot": true,
    "provider_api_keys": {
      "openai": { "enabled": true, "api_key": "sk-..." }
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### List Models Message

Request available LLM models.

**Type**: `list-models`

**Payload**: `{}`

**Response**: `models-listed`

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174003",
  "type": "list-models",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Result Message

Send a tool execution result from SDK/main local-runtime dispatch.

**Type**: `tool-result`

**Payload**:
```json
{
  "request_id": "opaque-request-id-from-tool-call",
  "success": true,
  "data": {
    "output": "Preformatted tool output text",
    "screenshot_ref": "uuid.jpg", // Optional, computer-use tools only
    "screenshot": "base64-encoded-screenshot", // Optional inline payload, computer-use tools only
    "capture_meta": { "frame_id": "frame-1" },
    "system_state": { "active_window": "...", "mouse_position": "..." },
    "system_state_internal": { "active_window": "...", "mouse_position": "...", "screen_resolution": "..." } // Optional backend-only runtime state
  },
  "error": null
}
```

`request_id` must echo the `tool-call` payload `request_id` value for correlation.
`data.system_state` is optional in schema; when present it should include `active_window` and `mouse_position`.
`data.system_state_internal` is optional backend-only runtime state and is not model-facing tool-output content.
`data.capture_meta` is optional screenshot/capture frame metadata.
For non-computer tools, omit `data.screenshot_ref` and `data.screenshot`.

**Response**: Acknowledgment (no specific response type)

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174004",
  "type": "tool-result",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "data": {
      "output": "Clicked submit button",
      "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg",
      "system_state": {
        "active_window": "Browser",
        "mouse_position": "(100, 200)"
      }
    },
    "error": null
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Bundle Result Message

Result of an atomic tool bundle executed through SDK/main local-runtime dispatch.

**Type**: `tool-bundle-result`

**Payload**:
```json
{
  "bundle_id": "bundle-123",
  "status": "success", // success | partial_failure | failure
  "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg", // Optional, computer-use bundles only
  "screenshot": "base64-encoded-screenshot", // Optional inline payload, computer-use bundles only
  "capture_meta": { "frame_id": "frame-1" },
  "system_state": { "active_window": "...", "mouse_position": "..." },
  "step_results": [
    {
      "tool": "run_shell_command",
      "status": "ok",
      "output": { "stdout": "line-1", "exit_code": 0 },
      "debug_trace": "optional-debug-info"
    }
  ],
  "error": null
}
```

`step_results` notes:
- `status` convention from SDK/main bundle execution is `ok` / `error` (bundle-level `status` remains `success` / `partial_failure` / `failure`).
- `output` may be a string or structured object.
- additional per-step fields are allowed and preserved.
- if a step succeeds without explicit `output`, SDK/main result shaping uses fallback text: `Tool <tool_name> executed successfully (no output)`.
- screenshot fields are omitted for bundles without computer-use actions.
- when `system_state` is present, it uses `{ active_window, mouse_position }`.

### Wakeword Detected Message

Notify backend that wakeword was detected.

**Type**: `wakeword-detected`

**Payload**: `{}`

**Response Sequence**:
1. `wakeword-activated`
2. `wakeword-greeting`
3. `audio-chunk` (zero or more messages when speech-mode TTS streaming is active)

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "wakeword-detected",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

## Server Messages (Backend -> SDK/Renderer Consumers)

### Streaming Response Message

Streaming text chunks from LLM.

**Type**: `streaming-response`

**Payload**:
```json
{
  "text": "Text chunk"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "streaming-response",
  "payload": {
    "text": "I'll help you click the submit button."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Audio Chunk Message

Base64 audio chunk emitted by backend TTS streaming.

**Type**: `audio-chunk`

**Payload**:
```json
{
  "audio": "base64-encoded-pcm16le-audio",
  "sample_rate": 22050
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "audio-chunk",
  "payload": {
    "audio": "UklGRiQAAABXQVZF...",
    "sample_rate": 22050
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Call Message

Request tool execution through SDK/main local-runtime dispatch.

**Type**: `tool-call`

**Payload**:
```json
{
  "tool_name": "mouse_control",
  "parameters": {
    "action": "click",
    "x": 100,
    "y": 200
  },
  "request_id": "unique-request-id",
  "metadata": {
    "tool_call_id": "call_abc123"
  }
}
```

`request_id` is generated by backend tool preparation and must be treated as an opaque correlation id.
`metadata.tool_call_id` is provider-sourced when the LLM/provider returns a tool-call id; backend falls back to `tool_call_<index>` if missing.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174006",
  "type": "tool-call",
  "payload": {
    "tool_name": "mouse_control",
    "parameters": {
      "action": "click",
      "x": 100,
      "y": 200
    },
    "request_id": "req-123",
    "metadata": {
      "tool_call_id": "call_abc123"
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Output Message

Tool execution result from backend.

**Type**: `tool-output`

**Payload**:
```json
{
  "tool_name": "mouse_control",
  "success": true,
  "execution_time": 0.42,
  "output": "Formatted tool output",
  "error": null,
  "screenshot_ref": "uuid.jpg",
  "screenshot": "base64-encoded-screenshot",
  "metadata": { ... }
}
```

`screenshot_ref` is the preferred attachment field when the screenshot was uploaded as an artifact.
`screenshot` remains the inline fallback when no artifact reference is available.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174007",
  "type": "tool-output",
  "payload": {
    "tool_name": "mouse_control",
    "success": true,
    "execution_time": 0.42,
    "output": "Clicked submit button",
    "error": null,
    "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg",
    "metadata": {
      "active_window": "Browser"
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### LLM Thought Message

LLM thinking/reasoning tokens (Gemini models).

**Type**: `llm-thought`

**Payload**:
```json
{
  "status": "Thinking token text"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174008",
  "type": "llm-thought",
  "payload": {
    "status": "I need to find the submit button first..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Error Message

Error response from backend.

**Type**: `error`

**Payload**:
```json
{
  "message": "Error message"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174009",
  "type": "error",
  "payload": {
    "message": "Tool execution failed"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Streaming Complete Message

End of streaming response.

**Type**: `streaming-complete`

**Payload**: `{ "final_response"?: string }`

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174010",
  "type": "streaming-complete",
  "payload": {
    "final_response": "Done."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Settings Loaded Message

Response to load-settings request.

**Type**: `settings-loaded`

**Payload**:
```json
{
  "config": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
    "interaction_mode": "chat",
    "speech_mode_enabled": true,
    "wakeword_enabled": true,
    "wakeword_stt_enabled": false,
    "browser_automation_enabled": false,
    "include_query_screenshot": true,
    "provider_api_keys": {
      "openai": { "enabled": true, "api_key": "" }
    }
  }
}
```

**Status**: Emitted by backend in response to `load-settings`. Provider API key entries preserve non-secret state such as `enabled`, but `api_key` is redacted to an empty string.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174011",
  "type": "settings-loaded",
  "payload": {
    "config": {
      "model_mode": "online",
      "model_provider": "openai",
      "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
      "interaction_mode": "chat",
      "speech_mode_enabled": true,
      "wakeword_enabled": true,
      "wakeword_stt_enabled": false,
      "browser_automation_enabled": false,
      "include_query_screenshot": true,
      "provider_api_keys": {
        "openai": { "enabled": true, "api_key": "" }
      }
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Settings Updated Message

Response to update-settings request.

**Type**: `settings-updated`

**Payload**:
```json
{
  "updated_keys": ["model_provider", "selected_model_id"]
}
```

**Status**: Emitted by backend after applying session config updates.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174012",
  "type": "settings-updated",
  "payload": {
    "updated_keys": ["model_provider", "selected_model_id"]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Models Listed Message

Response to list-models request.

**Type**: `models-listed`

**Payload**:
```json
{
  "local": [
    {
      "id": "llama-2-7b",
      "provider": "ollama",
      "display_name": "llama-2-7b"
    }
  ],
  "online": [
    {
      "id": "gpt-5.4@@gpt-5-4-none-thinking",
      "provider": "openai",
      "runtime_model_id": "gpt-5.4",
      "family_id": "openai::gpt-5.4",
      "family_label": "GPT-5.4",
      "display_name": "GPT-5.4 None",
      "supports_thinking": true,
      "reasoning_mode": "none",
      "reasoning_modes": ["none", "low", "medium", "high", "xhigh"],
      "default_reasoning_mode": "none",
      "default_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
      "supports_native_web_search": true,
      "capabilities": {
        "supports_native_web_search": true
      },
      "context_window": 400000,
      "description": "OpenAI's GPT-5.4 reasoning model with configurable effort from none through xhigh.",
      "strengths": ["Reasoning", "Code", "Agents", "Tools"],
      "input_price": "Free",
      "output_price": "Free",
      "latency": "~1.4s"
    },
    {
      "id": "claude-sonnet-4-5-20250929",
      "provider": "anthropic",
      "display_name": "anthropic/claude-sonnet-4-5-20250929",
      "supports_thinking": true,
      "context_window": 200000,
      "description": "Anthropic's Claude Sonnet 4.5 balances strong coding, reasoning, and agent reliability.",
      "strengths": ["Agents", "Coding", "Writing", "Reliable"],
      "input_price": "Free",
      "output_price": "Free",
      "latency": "~1.3s"
    }
  ],
  "vision": [
    {
      "id": "OpenGVLab/InternVL3_5-4B",
      "provider": "huggingface-local",
      "display_name": "huggingface-local/OpenGVLab/InternVL3_5-4B"
    }
  ]
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174013",
  "type": "models-listed",
  "payload": {
    "local": [
      {
        "id": "llama-2-7b",
        "provider": "ollama",
        "display_name": "llama-2-7b"
      }
    ],
    "online": [
      {
        "id": "gpt-5.4@@gpt-5-4-none-thinking",
        "provider": "openai",
        "runtime_model_id": "gpt-5.4",
        "family_id": "openai::gpt-5.4",
        "family_label": "GPT-5.4",
        "display_name": "GPT-5.4 None",
        "supports_thinking": true,
        "reasoning_mode": "none",
        "reasoning_modes": ["none", "low", "medium", "high", "xhigh"],
        "default_reasoning_mode": "none",
        "default_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
        "supports_native_web_search": true,
        "capabilities": {
          "supports_native_web_search": true
        },
        "context_window": 400000,
        "description": "OpenAI's GPT-5.4 reasoning model with configurable effort from none through xhigh.",
        "strengths": ["Reasoning", "Code", "Agents", "Tools"],
        "input_price": "Free",
        "output_price": "Free",
        "latency": "~1.4s"
      },
      {
        "id": "claude-sonnet-4-5-20250929",
        "provider": "anthropic",
        "display_name": "anthropic/claude-sonnet-4-5-20250929",
        "supports_thinking": true,
        "context_window": 200000,
        "description": "Anthropic's Claude Sonnet 4.5 balances strong coding, reasoning, and agent reliability.",
        "strengths": ["Agents", "Coding", "Writing", "Reliable"],
        "input_price": "Free",
        "output_price": "Free",
        "latency": "~1.3s"
      }
    ],
    "vision": [
      {
        "id": "OpenGVLab/InternVL3_5-4B",
        "provider": "huggingface-local",
        "display_name": "huggingface-local/OpenGVLab/InternVL3_5-4B"
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Bundle Start Message

Atomic bundle of tools to execute together (replaces bundle_start + N tool-calls + bundle_end).

**Type**: `tool-bundle`

**Payload**:
```json
{
  "bundle_id": "bundle-123",
  "tools": [
    {
      "name": "mouse_control",
      "args": { "x": 100, "y": 200, "action": "click" }
    },
    {
      "name": "keyboard_control",
      "args": { "text": "Hello", "action": "type" }
    }
  ]
}
```

**Description**: Single message containing all tools in a bundle. SDK/main local-runtime dispatch executes all tools sequentially and returns a single `tool-bundle-result` message.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174014",
  "type": "tool-bundle",
  "payload": {
    "bundle_id": "bundle-123",
    "tools": [
      {
        "name": "mouse_control",
        "args": { "x": 100, "y": 200, "action": "click" }
      },
      {
        "name": "keyboard_control",
        "args": { "text": "Hello", "action": "type" }
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Wakeword Activated Message

Wakeword activation status emitted before greeting text.

**Type**: `wakeword-activated`

**Payload**:
```json
{
  "speech_mode_enabled": true,
  "greeting": "Hello! I'm listening.",
  "status": "listening"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174018",
  "type": "wakeword-activated",
  "payload": {
    "speech_mode_enabled": true,
    "greeting": "Hello! I'm listening.",
    "status": "listening"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Wakeword Greeting Message

Greeting message sent when wakeword is detected (after `wakeword-activated`).

**Type**: `wakeword-greeting`

**Payload**:
```json
{
  "text": "Hello! I'm listening."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174018",
  "type": "wakeword-greeting",
  "payload": {
    "text": "Hello! I'm listening."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### System Prompt Message

System prompt emitted for SDK/renderer transparency display. Tool schemas are emitted separately as a `tool-schemas` event.

**Type**: `system-prompt`

**Payload**:
```json
{
  "content": "You are a helpful assistant..."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174019",
  "type": "system-prompt",
  "payload": {
    "content": "You are a helpful assistant..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### User Message Full Message

Full user message content for transparency display.

**Type**: `user-message-full`

**Payload**:
```json
{
  "content": "Full user message with context XML...",
  "metadata": {
    "has_screenshot": true,
    "has_memory": true
  }
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174020",
  "type": "user-message-full",
  "payload": {
    "content": "<episodic_memory>\nNone\n</episodic_memory>\n\n<semantic_memory>\nNone\n</semantic_memory>\n\n<user_query>\nClick submit\n</user_query>",
    "metadata": {
      "has_screenshot": true,
      "has_memory": true
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Assistant Message Full Message

Full assistant message content for transparency display.

**Type**: `assistant-message-full`

**Payload**:
```json
{
  "content": "Full assistant response..."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174021",
  "type": "assistant-message-full",
  "payload": {
    "content": "I'll help you click the submit button..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Schemas Message

Tool schemas emitted for SDK/renderer transparency display (first message metadata window). These are canonical OpenAI/LiteLLM tool objects.

**Type**: `tool-schemas`

**Payload**:
```json
{
  "tool_schemas": [
    {
      "type": "function",
      "function": {
        "name": "mouse_control",
        "description": "Control mouse actions",
        "parameters": {
          "type": "object",
          "properties": { ... }
        }
      }
    }
  ]
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174022",
  "type": "tool-schemas",
  "payload": {
    "tool_schemas": [
      {
        "type": "function",
        "function": {
          "name": "mouse_control",
          "parameters": {
            "type": "object",
            "properties": {
              "action": {
                "type": "string",
                "enum": ["click", "double_click", "right_click"]
              }
            }
          }
        }
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Token Count Message

Token usage information for the current interaction.

**Type**: `token-count`

**Payload**:
```json
{
  "prompt_tokens": 150,
  "visible_output_tokens": 38,
  "thinking_tokens": 12,
  "output_tokens_total": 50,
  "total_tokens": 200,
  "conversation_tokens": 3200,
  "usage_source": "provider"
}
```

Notes:
- `visible_output_tokens` counts only assistant text shown to users.
- `thinking_tokens` is provider-reported reasoning/thought token usage. It may be `null` when unavailable.
- `output_tokens_total` includes visible output plus hidden reasoning where the provider reports it.
- `usage_source` is `provider` when prompt/output/total counts come fully from provider usage; otherwise `estimated`.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174023",
  "type": "token-count",
  "payload": {
    "prompt_tokens": 150,
    "visible_output_tokens": 38,
    "thinking_tokens": null,
    "output_tokens_total": 38,
    "total_tokens": 188,
    "conversation_tokens": 3200,
    "usage_source": "estimated"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Client Tool Manifest Event

The backend emits `client-tool-manifest` after validating the handshake
manifest. Renderer clients receive it through the typed `agent-capability-event`
channel.

**Type**: `client-tool-manifest`

**Payload**:
```json
{
  "accepted": [
    {
      "name": "read_file",
      "description": "Read a UTF-8 text file from disk",
      "execution_target": "local_runtime"
    }
  ],
  "rejected": [
    {
      "name": "danger_tool",
      "reason": "reserved backend tool names cannot be overridden"
    }
  ]
}
```

## Error Codes

### Common Error Codes (Internal)

Error responses sent to clients include **only** a `message` string. These
codes are internal to the backend exception hierarchy and may appear in logs.

- `CONFIG_ERROR`: Configuration error
- `LLM_ERROR`: LLM error
- `LLM_API_ERROR`: LLM API error
- `LLM_RATE_LIMIT`: LLM rate limit
- `TOOL_EXECUTION_ERROR`: Tool execution failed
- `TOOL_VALIDATION_ERROR`: Tool validation failed
- `TOOL_NOT_FOUND`: Tool not found
- `MEMORY_ERROR`: Memory system error
- `MEMORY_STORE_ERROR`: Memory store failure
- `EMBEDDING_ERROR`: Embedding failure
- `SESSION_ERROR`: Session error
- `INPUT_SIZE_LIMIT_ERROR`: Input size limit
- `PARSE_TIMEOUT_ERROR`: Parse timeout
- `PARSE_VALIDATION_ERROR`: Parse validation error

## Rate Limiting

**Limits**:
- Max message size: 10MB
- Max concurrent tasks: 50 per connection
- Receive timeout: 3600 seconds (1 hour)

## Connection Management

### Handshake

On hosted connections, the client first authenticates with an install bearer
token and then sends the websocket handshake payload. The backend resolves the
real `user_id` from the token and does not trust a mismatched claimed
`user_id` from the client:

```json
{
  "type": "handshake",
  "user_id": "user-123",
  "agent_definition": {
    "version": 1,
    "tools": {
      "mode": "default_plus_client",
      "client_manifest": {
        "version": 1,
        "tools": []
      }
    }
  }
}
```

If the client has local tool schemas, it sends them in
`agent_definition.tools.client_manifest` on this handshake. The backend
validates that manifest during handshake setup and emits a
`client-tool-manifest` event with accepted/rejected diagnostics. There is no
current post-handshake client tool-schema sync message.

Current sequence:
1. Connect WebSocket
2. Send `handshake` with optional `agent_definition`
3. Receive optional `client-tool-manifest` / `remote-tool-catalog` startup
   events
4. Send `query`

### Reconnection

- Auto-reconnect on disconnect
- Exponential backoff
- Max reconnection attempts: 5

## Security

### Message Validation

- All messages validated via Pydantic
- Type checking enforced
- Required fields validated
- Sanitization applied

### Connection Security

- WebSocket on localhost only
- No external access
- IPC channels whitelisted
- Content Security Policy enforced

---

For more detailed information, see:
- [Communication Flow](../architecture/communication_flow.md)
- Backend Architecture (private backend docs)
- [Frontend Architecture](../architecture/frontend_architecture.md)
- ADR 005: `docs/adr/005-frontend-tool-schema-source-of-truth.md`
