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

Browser execution is routed through the maintained Browser Use CLI daemon via `frontend/src/main/python/tools/browser/browser_use_engine.py`.

- The hosted backend owns the model-facing `browser` tool schema, backend validation, agent loop, provider policy, and result shape. Electron main and renderer own permission/readiness UI and visible browser status.
- The local-runtime Python browser adapter owns the dedicated Chrome profile launch and CDP endpoint; Browser Use owns daemon session lifecycle after attaching, CDP/Playwright edge cases, DOM state extraction, numeric element indexes, click/input/scroll/upload/tab actions, screenshots, and daemon recovery.
- The local-runtime Python browser adapter invokes Browser Use with
  `python -m browser_use.skill_cli.main` from the same Python environment.
- Browser Use daemon files live under `AGENT_BROWSER_USE_HOME`
  (`WINDIE_BROWSER_USE_HOME` in WindieOS launches) when set, otherwise under
  the active desktop app data directory at `browser-use/`.
- The default Browser Use session name is `desktop-agent`; override with
  `AGENT_BROWSER_USE_SESSION` or the WindieOS alias
  `WINDIE_BROWSER_USE_SESSION=windieos` for diagnostics, isolated local
  sessions, or intentionally reusing a legacy Browser Use session. Legacy
  `windieos` Browser Use sessions are not migrated automatically.
- Override the command path with `AGENT_BROWSER_USE_CLI`
  (`WINDIE_BROWSER_USE_CLI` in WindieOS launches) only for diagnostics.
- Override per-command timeout with `AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS`
  (`WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS` in WindieOS launches).

## Overview

The `browser` tool uses one connect model:

1. **Desktop Runtime Browser Use Session** - a Browser Use daemon session named `desktop-agent` by default.
2. The local-runtime browser adapter launches or reuses the dedicated persistent Chrome profile with CDP.
3. Browser Use attaches to that CDP endpoint and maintains automation for the session.
4. `connect` starts or reuses the Browser Use session and returns Browser Use state text.

## Installation

### Prerequisites

```bash
# Install Python deps (official Browser Use package + Playwright)
cd frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

The browser feature pack now requires the `browser_use` Python module. Browser Use package updates should be handled by changing the dependency version range and rerunning the focused browser tests, not by editing vendored Browser Use source.

## Connect Behavior

**No manual setup required.** When you issue a browser request, the `connect` action will:
1. Reuse the named Browser Use daemon session when it is already running.
2. Otherwise start the Browser Use daemon and a headed browser session.
3. Leave hosted backend agent orchestration and tool-call policy unchanged.

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

In addition to browser lifecycle actions (`connect`, `status`, `profiles`, `snapshot`, `get_tabs`, etc.), `browser` exposes a flat action schema over Browser Use-backed actions:

- `navigate`, `click`, `extract`, `scroll`, `screenshot`, `wait`, `evaluate`, `close`
- `search`, `go_back`, `done`
- `search_page`, `find_elements`, `find_text`
- `input`, `send_keys`, `switch`, `close_tab`
- `select_dropdown`, `upload_file`, `hover`, `save_as_pdf`
- `get_text`, `get_value`, `get_attributes`, `get_bbox`
- `write_file`, `replace_file`, `read_file`, `read_long_content`

Notes:
- `switch` and `close_tab` use numeric `tab_index` values from `get_tabs`.
- `close` closes the controlled browser session.
- `done` is exposed for parity with Browser Use completion tooling.
- Browser Use actions are also supported via `act.request.kind` using the same names.
- `switch` defaults to visible tab activation, but supports `activate=false` for internal-only target changes so the browser adapter can control a different tab without bringing it to the foreground in the user-visible browser window.
- `find_text` supports optional `css_scope` and `max_results`, matching the scoped page-search behavior used by `search_page`.
- `find_elements` returns non-actionable `ordinal` values for CSS query results. Use `snapshot.output` indexes for `click`, `input`, `hover`, `upload_file`, `select_dropdown`, and `get_*` actions.
- Browser-internal navigation targets such as `chrome://settings/syncSetup` are routed through Browser Use's Python `browser.goto(...)` action wrapper so the Browser Use CLI `open` command cannot rewrite them into `https://...` URLs.
- Overlapping actions now run Browser Use-only semantics at runtime (`snapshot`, `navigate`, `extract`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `evaluate`): compatibility-only fields are rejected (for example `snapshot.format`, `snapshot.snapshotFormat`, `snapshot.wait_until`, `snapshot.mode`, `snapshot.max_chars`, `snapshot.refs`, `snapshot.interactive`, `snapshot.compact`, `snapshot.depth`, `snapshot.selector`, `snapshot.frame`, `extract.mode`, `extract.selector`, `extract.frame`, `wait.state`, `screenshot.full_page`, `screenshot.ref`, `screenshot.element`, `screenshot.type`, `screenshot.quality`).
- For `click`, `input`, `hover`, `upload_file`, `select_dropdown`, and `get_*`, the Browser Use engine requires numeric Browser Use element indexes. Role refs such as `e12` and `ref` aliases are rejected by validation instead of being routed through the retired controller locator path.

### 1. Connect

Initialize or attach the dedicated desktop browser instance.

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
- Snapshot returns Browser Use state text in `output` plus metadata (`ref_count`, `offset`, `limit`, `returned_chars`, `total_chars`, `has_more`, `next_offset`).
- `offset + limit` must be `<= 120000`.
- Compatibility snapshot fields are rejected at runtime (`format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`).

Pagination discipline:
- If `has_more=true`, continue with `snapshot` using `offset=next_offset` and same `limit`.
- Do not `scroll`/`click`/`navigate`/`input` while paginating one snapshot window.
- After any page-changing action, restart snapshot pagination from `offset=0`.

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

Extract returns focused page text in `output` plus extraction metadata. The local-runtime adapter reads page HTML through Browser Use and applies the deterministic markdown/focused-excerpt path, so extraction does not require a Browser Use model override.

### 5. Click

Click an element by Browser Use index or coordinate pair.

```json
{
  "action": "click",
  "index": 1,
  "button": "left"
}
```

Browser Use-style alternatives:
- `index`: element index from Browser Use snapshot state.
- `coordinate_x` + `coordinate_y`: viewport coordinate click pair.

Options:
- `double_click: true` - Double click
- `button: "right"` - Right click

### 6. Type / Input

Type text into an input.

```json
{
  "action": "input",
  "index": 3,
  "text": "windieos"
}
```

Use `index` from the latest `snapshot.output`. Role refs such as `"e12"` are rejected by validation.
Use `send_keys` with `Enter` when submission is intended.

### 6b. Select Dropdown

Select a dropdown option by visible text or exact value match.

```json
{
  "action": "select_dropdown",
  "index": 9,
  "text": "Price: Low to High"
}
```

Use an actionable numeric element index from the latest `snapshot.output`.

### 6c. Upload File

Populate a file input by actionable snapshot index.

```json
{
  "action": "upload_file",
  "index": 5,
  "path": "/tmp/example.txt"
}
```

Use an actionable numeric element index from the latest `snapshot.output`.

### 7. Send Keys

Send a keyboard key sequence.

```json
{
  "action": "send_keys",
  "keys": "Enter"
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
- `direction`: explicit Browser Use direction flag.

### 9. Screenshot

Capture screenshot.

```json
{
  "action": "screenshot",
  "file_name": "page.png"
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
  "action": "switch",
  "tab_index": 1
}
```

Optional:
- `activate`: defaults to `true`. Set `false` to change the internal browser-control target without bringing that tab to the foreground in the visible browser window.

### Chat Header Browser Control

The dashboard chat header exposes the same dedicated browser session with a compact control:

- While the local runtime is still starting, the button stays disabled, shows **Starting local runtime...**, and waits for the shared `local-runtime-status` ready signal instead of issuing browser tool calls immediately on mount.
- If local runtime startup fails, the button shows **Browser unavailable** and keeps the short sanitized error in the button title.
- When disconnected, it shows **Connect browser**.
- After the user requests a connection, it shows **Connecting browser...** until the browser action finishes.
- When connected, it shows **Browser Tab: <tab name>**.
- Opening the carousel shows all current tabs, updates as tabs change, and uses internal-only `switch` calls (`activate=false`) so changing the controlled tab does not visibly switch the browser window for the user.
- The renderer keeps one shared browser-session snapshot for this control and polls tab state every 2 seconds while connected, tightening to 1 second while the carousel is open.
- The header control optimistically updates the selected tab from the successful `switch` result and avoids a forced slide remount, so changing tabs should not flash or visibly reload the control.

### 13. Evaluate

Execute JavaScript.

```json
{
  "action": "evaluate",
  "code": "window.location.href"
}
```

### 14. Close

Close browser connection.

```json
{
  "action": "close"
}
```

## Removed Aliases

Legacy aliases such as `type`, `press`, `open`, and `switch_tab` are not part
of the model-visible browser schema. Use `input`, `send_keys`, `navigate`, and
`switch` instead.

Unsupported browser-controller actions remain removed from runtime routing
(`console`, `errors`, `requests`, `trace_start`, `trace_stop`, `dialog`,
`cookies*`, `storage*`, `set_*`, and legacy upload shapes).

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

// 4. Type search query and submit explicitly
{"action": "input", "index": 3, "text": "python async tutorial"}
{"action": "send_keys", "keys": "Enter"}

// 5. Wait for results
{"action": "wait", "seconds": 2}

// 6. Get new snapshot
{"action": "snapshot"}

// 7. Click first result
{"action": "click", "index": 5}

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
{"action": "input", "index": 1, "text": "John Doe"}
{"action": "input", "index": 2, "text": "john@example.com"}
{"action": "input", "index": 3, "text": "Hello, this is a test message."}

// Submit
{"action": "click", "index": 4}

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
//     {"tab_index": 0, "title": "GitHub", "url": "https://github.com"},
//     {"tab_index": 1, "title": "Documentation", "url": "https://docs.example.com"},
//     {"tab_index": 2, "title": "Settings", "url": "https://settings.example.com"}
//   ]
// }

// Switch to documentation tab
{"action": "switch", "tab_index": 1}

// Get snapshot of that tab
{"action": "snapshot"}

{"action": "close"}
```

## Troubleshooting

### Cannot Connect to Dedicated Browser

**Error:** `Cannot connect to Chrome at http://127.0.0.1:9333`

**Solutions:**

1. **Auto-launch** (recommended): `connect` auto-attaches to an existing dedicated browser instance or launches one automatically.
2. **If launch still fails**, close stale dedicated browser instances and retry `{"action":"connect"}`.
3. **Check dedicated browser CDP port availability**:
   ```bash
   lsof -i :9333  # macOS/Linux
   netstat -ano | findstr :9333  # Windows
   ```
4. **Use a different dedicated browser CDP port** by setting:
   ```bash
   export AGENT_BROWSER_CDP_PORT=9334
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
3. If the site blocks automation, retry after a fresh `connect` or use a different site flow.

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
2. **Use the dedicated browser session** - Browser automation runs through the isolated Browser Use/CDP path.
3. **Close when done** - Frees resources
4. **Handle failures gracefully** - Pages can change, elements may not exist

## Architecture

```text
Backend model/tool policy
  <-> SDK/main local-runtime dispatch
    -> local-runtime Python browser adapter
      -> Browser Use daemon
        -> dedicated Chrome profile over localhost CDP
```

- **Backend**: Exposes tool schema to the model and orchestrates model turns.
- **SDK/main local runtime**: Dispatches local browser tool calls and returns normalized results.
- **Local-runtime Python browser adapter**: Adapts browser actions to Browser Use and the dedicated CDP profile.
- **Chrome**: Dedicated profile controlled through localhost CDP.

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
- **Dedicated browser profile** is separate from the user's default browser profile
- **Screenshots** may contain sensitive data
- **JavaScript evaluation** can execute arbitrary code
