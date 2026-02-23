---
summary: "Browser Control Tool"
read_when:
  - Setting up browser automation
  - Using browser tool
  - Troubleshooting browser connection
---

# Browser Control

WindieOS provides a powerful **browser control tool** that allows the AI agent to automate web browsers for online tasks.

## Runtime Selection

Browser execution is routed through the Browser Use compatibility adapter. Runtime selection:

- Browser Use-native runtime is the default and required execution path (`browser_use_native`).
- Optional runtime value: `WINDIE_BROWSER_USE_RUNTIME=browser_use` (alias of `browser_use_native`).
- Startup fails fast if local `browser_use` runtime modules are unavailable or native runtime provider loading fails.
- Runtime initialization enforces vendored Browser Use import origin (`frontend/src/main/python/tools/browser/browser_use`) and rejects external/site-packages `browser_use` resolution.
- Optional native handler module override remains available for diagnostics (`WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`).
- Browser Use extraction actions (`extract`, `read_long_content`) resolve the extraction LLM from WindieOS model settings by default.
- Optional extraction overrides:
  - Windie-style provider/model: `WINDIE_BROWSER_USE_EXTRACTION_PROVIDER` + `WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID`
  - Optional provider credentials/endpoint: `WINDIE_BROWSER_USE_EXTRACTION_API_KEY`, `WINDIE_BROWSER_USE_EXTRACTION_BASE_URL`
  - Browser Use explicit model-name override: `WINDIE_BROWSER_USE_EXTRACTION_MODEL` (example: `openai_gpt_4o_mini`)

## Overview

The `browser` tool uses one connect model:

1. **WindieOS Dedicated Browser Instance** - A persistent, Windie-owned Chrome profile used only for WindieOS automation.
2. This instance is isolated from the user's default browser profile (credentials/session state do not affect the default profile).
3. `connect` auto-attaches to this instance when already running, or launches it when not running.

## Installation

### Prerequisites

```bash
# Install Python deps (Browser Use runtime code is vendored in-repo + playwright)
cd frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

Vendored Browser Use sync is manual (no in-repo helper script at this time):

- Copy updates from `../browser-use/browser_use` into `frontend/src/main/python/tools/browser/browser_use`.
- Update `frontend/src/main/python/tools/browser/browser_use_vendor_manifest.json` (`source_commit`, `synced_at_utc`, `pruned_paths`) to reflect the synced source.

Vendored parity check command:

```bash
cd WindieOS
python -m pytest tests/sidecar/tools/test_browser_use_tool_parity.py -q
```

Parity check guarantees:
- Runtime import resolves to vendored `frontend/src/main/python/tools/browser/browser_use`.
- Sidecar requirements do not depend on pip `browser-use`.
- Sidecar schema, backend schema, native handler registry, and adapter dispatch all cover Browser Use action registry names.

## Connect Behavior

**No manual setup required.** When you issue a browser request, WindieOS connect will:
1. Attach to the WindieOS dedicated browser instance when its CDP endpoint is already available.
2. Otherwise launch a dedicated instance with persistent WindieOS profile data.
3. Leave the user's default browser process/profile untouched, even if it is currently active.

Connect via the tool:
```json
{
  "action": "connect"
}
```

### Security Note

CDP connections are restricted to localhost for security. The agent can only connect to browsers running on your local machine.

## Actions

### Browser Use Action Surface

In addition to WindieOS compatibility actions (`connect`, `navigate`, `snapshot`, `click`, `type`, etc.), `browser` now exposes Browser Use-style action names directly:

- `navigate`, `click`, `extract`, `scroll`, `screenshot`, `wait`, `evaluate`, `close`
- `search`, `go_back`, `done`
- `search_page`, `find_elements`, `find_text`
- `input`, `send_keys`, `switch`, `close_tab`
- `dropdown_options`, `select_dropdown`, `upload_file`
- `write_file`, `replace_file`, `read_file`, `read_long_content`

Notes:
- `close_tab` maps to Browser Use tab-close semantics.
- `close` uses Browser Use close semantics when `tab_id`/`target_id` is provided; otherwise it closes the WindieOS browser session.
- `done` is exposed for parity with Browser Use completion tooling.
- Browser Use tab IDs are short IDs; when `target_id` is supplied, WindieOS derives a tab ID suffix.
- Browser Use actions are also supported via `act.request.kind` using the same names.
- Overlapping actions now run Browser Use-only semantics at runtime (`snapshot`, `navigate`, `extract`, `click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `evaluate`): compatibility-only fields are rejected (for example `snapshot.format`, `snapshot.snapshotFormat`, `snapshot.wait_until`, `snapshot.mode`, `snapshot.max_chars`, `snapshot.refs`, `snapshot.interactive`, `snapshot.compact`, `snapshot.depth`, `snapshot.selector`, `snapshot.frame`, `extract.mode`, `extract.selector`, `extract.frame`, `wait.state`, `screenshot.full_page`, `screenshot.ref`, `screenshot.element`, `screenshot.type`, `screenshot.quality`).

### 1. Connect

Initialize/attach the WindieOS dedicated browser instance.

```json
{
  "action": "connect"
}
```

### 2. Navigate

Go to a URL.

```json
{
  "action": "navigate",
  "url": "https://github.com"
}
```

### 3. Snapshot

Get Browser Use-native browser state text (`dom_state.llm_representation()`) with numeric interactive indexes.

```json
{
  "action": "snapshot",
  "offset": 0,
  "limit": 4000
}
```

**Snapshot Output:**
```
[33]<div>User form</div>
[35]<button aria-label='Submit form'>Submit</button>
```

Snapshot options:
- `offset`: optional character offset for paginated snapshot reads
- `limit`: optional character page size for snapshot text (`4000` default)
- `include_screenshot`: optional boolean to include Browser Use base64 screenshot in response

Defaults:
- Snapshot output returns Browser Use state text plus metadata (`ref_count`, `offset`, `limit`, `returned_chars`, `total_chars`, `has_more`, `next_offset`).
- `offset + limit` must be `<= 120000`.
- Compatibility snapshot fields are rejected at runtime (`format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`).

Pagination example:
```json
{
  "action": "snapshot",
  "offset": 4000,
  "limit": 4000
}
```

Automatic post-action snapshots:
- Temporarily disabled for testing.
- Use explicit `snapshot` calls after actions when you need updated page refs/metadata.

### 4. Extract

Extract page content using Browser Use native extract tooling.

```json
{
  "action": "extract",
  "query": "list all pricing tiers and monthly cost"
}
```

Extract options (Browser Use semantics):
- `query` (required): what to extract from the current page.
- `extract_links`: include link lines in source text before extraction (`false` default).
- `start_from_char`: continue extraction from a character offset for long pages (`0` default).
- `output_schema`: optional structured-output hint passed to Browser Use extract.

Extract output mirrors Browser Use action results (`extracted_content`, metadata, and optional schema-structured content when supported by Browser Use).  
Runtime requirement: configure extraction LLM via Windie provider/model (`WINDIE_BROWSER_USE_EXTRACTION_PROVIDER` + `WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID`) or set explicit Browser Use model-name override (`WINDIE_BROWSER_USE_EXTRACTION_MODEL`, for example `openai_gpt_4o_mini`).

### 5. Click

Click an element by reference/index or Browser Use coordinate pair.

```json
{
  "action": "click",
  "ref": "1",
  "button": "left"
}
```

`ref` can be numeric (`"12"`) or role-based (`"e12"`).
Browser Use-style alternatives:
- `index`: element index from Browser Use snapshot state.
- `coordinate_x` + `coordinate_y`: viewport coordinate click pair.

Options:
- `double_click: true` - Double click
- `button: "right"` - Right click

### 6. Type

Type text into an input.

```json
{
  "action": "type",
  "ref": "3",
  "text": "windieos",
  "submit": true
}
```

### 7. Press

Press a keyboard key.

```json
{
  "action": "press",
  "key": "Enter"
}
```

Common keys: `Enter`, `Escape`, `Tab`, `ArrowDown`, `ArrowUp`, `F5`

### 8. Scroll

Scroll the page.

```json
{
  "action": "scroll",
  "direction": "down",
  "amount": 500
}
```

Directions: `up`, `down`, `left`, `right`
Browser Use-style alternatives:
- `pages`: fractional or whole page increments (`0.5`, `1`, `2`).
- `down`: explicit Browser Use direction flag.
- `index`: scroll within a specific element index.

### 9. Screenshot

Capture screenshot.

```json
{
  "action": "screenshot",
  "full_page": true
}
```

Or screenshot specific element:
```json
{
  "action": "screenshot",
  "ref": "5"
}
```

### 10. Wait

Wait for load state or fixed time.

```json
{
  "action": "wait",
  "state": "networkidle"
}
```

Or wait seconds:
```json
{
  "action": "wait",
  "seconds": 3.0
}
```

### 11. Get Tabs

List open tabs.

```json
{
  "action": "get_tabs"
}
```

### 12. Switch Tab

Switch to a specific tab.

```json
{
  "action": "switch_tab",
  "target_id": "abc123"
}
```

### 13. Evaluate

Execute JavaScript.

```json
{
  "action": "evaluate",
  "script": "window.location.href"
}
```

### 14. Close

Close browser connection.

```json
{
  "action": "close"
}
```

## Compatibility Aliases

Supported aliases that map to Browser Use-native execution:

- `type` -> Browser Use `input`
- `press` -> Browser Use `send_keys`
- `open` -> Browser Use `navigate` with `new_tab=true`
- `switch_tab` -> Browser Use `switch`
- `get_tabs` / `status` -> Browser Use state summary bridge

Legacy non-Browser Use actions were removed from runtime routing and now return
`Unhandled action` if called (for example: `console`, `errors`, `requests`,
`trace_start`, `trace_stop`, `pdf`, `dialog`, `cookies*`, `storage*`, `set_*`, `upload`).

## Example Workflows

### Search on Google

```json
// 1. Connect to browser
{"action": "connect"}

// 2. Navigate to Google
{"action": "navigate", "url": "https://google.com"}

// 3. Get snapshot to find search box
{"action": "snapshot"}
// Result shows: [3] searchbox "Search"

// 4. Type search query
{"action": "type", "ref": "3", "text": "python async tutorial", "submit": true}

// 5. Wait for results
{"action": "wait", "seconds": 2}

// 6. Get new snapshot
{"action": "snapshot"}

// 7. Click first result
{"action": "click", "ref": "5"}

// 8. Close when done
{"action": "close"}
```

### Fill out a Form

```json
// Connect and navigate
{"action": "connect"}
{"action": "navigate", "url": "https://example.com/contact"}

// Get form fields
{"action": "snapshot"}
// [1] textbox "Name"
// [2] textbox "Email"
// [3] textarea "Message"
// [4] button "Submit"

// Fill form
{"action": "type", "ref": "1", "text": "John Doe"}
{"action": "type", "ref": "2", "text": "john@example.com"}
{"action": "type", "ref": "3", "text": "Hello, this is a test message."}

// Submit
{"action": "click", "ref": "4"}

// Take screenshot
{"action": "screenshot", "file_name": "contact-form.png"}

// Close
{"action": "close"}
```

### Check Multiple Tabs

```json
{"action": "connect"}

// List all tabs
{"action": "get_tabs"}
// Returns:
// {
//   "tab_count": 3,
//   "tabs": [
//     {"target_id": "id1", "title": "GitHub", "url": "https://github.com"},
//     {"target_id": "id2", "title": "Documentation", "url": "https://docs.example.com"},
//     {"target_id": "id3", "title": "Settings", "url": "https://settings.example.com"}
//   ]
// }

// Switch to documentation tab
{"action": "switch_tab", "target_id": "id2"}

// Get snapshot of that tab
{"action": "snapshot"}

{"action": "close"}
```

## Troubleshooting

### Cannot Connect to Windie Browser

**Error:** `Cannot connect to Chrome at http://127.0.0.1:9333`

**Solutions:**

1. **Auto-launch** (recommended): WindieOS connect auto-attaches to an existing Windie browser instance or launches one automatically.
2. **If launch still fails**, close stale Windie browser instances and retry `{"action":"connect"}`.
3. **Check Windie CDP port availability**:
   ```bash
   lsof -i :9333  # macOS/Linux
   netstat -ano | findstr :9333  # Windows
   ```
4. **Use a different Windie CDP port** by setting:
   ```bash
   export WINDIE_BROWSER_CDP_PORT=9334
   ```

### Element Not Found

**Error:** `Element not found` when clicking

**Solutions:**
1. Re-run `snapshot` - the page/DOM may have changed since the last snapshot
2. Check element is visible
3. Try waiting for element: `{"action": "wait", "seconds": 2}`

### Page Not Loading

**Solutions:**
1. Check internet connection
2. Try longer wait: `{"action": "wait", "seconds": 5}`
3. Check if site blocks automation (use managed mode)

### Browser Runtime Dependency Not Found

**Error:** `ModuleNotFoundError: No module named 'playwright'` or `No module named 'browser_use'`

**Solution:**
```bash
cd frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

## Best Practices

1. **Snapshot before interacting** - Ensures refs are attached and the target still exists
2. **Use managed mode for unknown sites** - Safer, no risk to your data
3. **Use user_chrome for logged-in tasks** - Access your existing sessions
4. **Close when done** - Frees resources
5. **Handle failures gracefully** - Pages can change, elements may not exist

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Backend   │◄──────────────────►│   Frontend   │
│   (LLM)     │                    │  (Electron)  │
└──────┬──────┘                    └──────┬───────┘
       │                                   │ IPC
       │                            ┌──────▼──────┐
       │                            │   Sidecar   │
       │                            │   (Python)  │
       │                            └──────┬──────┘
       │                                   │ Playwright
       │                            ┌──────▼──────┐
       │                            │    Chrome   │
       │                            │   (User or  │
       │                            │   Managed)  │
       │                            └─────────────┘
```

- **Backend**: Exposes tool schema to LLM, orchestrates execution
- **Sidecar**: Executes browser actions via Playwright
- **Chrome**: Controlled via Chrome DevTools Protocol (CDP)

## Browser Support

Auto-detected in order of preference:
1. Google Chrome
2. Brave Browser
3. Microsoft Edge
4. Chromium
5. Google Chrome Canary

Supported platforms:
- Linux (deb/rpm/snap packages)
- macOS (Intel/Apple Silicon)
- Windows

## Privacy & Security

- **CDP connections** are localhost-only
- **User Chrome** has full access to your browser data
- **Managed mode** runs isolated with no access to your profile
- **Screenshots** may contain sensitive data
- **JavaScript evaluation** can execute arbitrary code

Use managed mode when visiting untrusted sites.
