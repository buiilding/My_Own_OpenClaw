---
summary: "Browser Control Tool"
read_when:
  - Setting up browser automation
  - Using browser_control tool
  - Troubleshooting browser connection
---

# Browser Control

WindieOS provides a powerful **browser control tool** that allows the AI agent to automate web browsers for online tasks.

## Runtime Selection

Browser execution is routed through the Browser Use compatibility adapter. Runtime selection:

- Browser Use-native runtime is the default and required execution path (`browser_use_native`).
- Optional runtime value: `WINDIE_BROWSER_USE_RUNTIME=browser_use` (alias of `browser_use_native`).
- Startup fails fast if local `browser_use` runtime modules are unavailable or native runtime provider loading fails.
- Runtime initialization enforces vendored Browser Use import origin (`frontend/src/main/python/browser_use`) and rejects external/site-packages `browser_use` resolution.
- Optional native handler module override remains available for diagnostics (`WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`).
- Browser Use extraction actions (`extract`, `read_long_content`) require a Browser Use LLM model via `WINDIE_BROWSER_USE_EXTRACTION_MODEL` (example: `openai_gpt_4o_mini`).

## Overview

The `browser_control` tool supports two modes:

1. **User Chrome Mode** - Control your existing Chrome browser with all your logins and cookies
2. **Managed Mode** - Launch an isolated Chromium instance for safe automation

## Installation

### Prerequisites

```bash
# Install Python deps (Browser Use runtime code is vendored in-repo + playwright)
cd frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

Vendored Browser Use sync command:

```bash
cd WindieOS
./scripts/sync-browser-use-vendor
```

Vendored parity check command:

```bash
cd WindieOS
./scripts/check-browser-use-vendor
```

## User Chrome Mode

Connect to your existing Chrome browser for full access to your logged-in sessions.

### Auto-Launch (Recommended)

**No manual setup required!** When you say:
```
Connect to my browser and go to Amazon
```

The agent will **automatically**:
1. Check if Chrome is running with CDP enabled -> connect to it
2. If Chrome is not running -> launch a CDP-enabled Chrome profile
3. If Chrome is running without CDP -> return guidance to restart Chrome with `--remote-debugging-port`

Note: WindieOS does not currently auto-restart an already-running non-CDP Chrome process.

### Manual Setup (Optional)

If you prefer to start Chrome manually:

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome-cdp" --profile-directory="Default"
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Then connect via the tool:
```json
{
  "action": "connect",
  "mode": "user_chrome",
  "cdp_url": "http://127.0.0.1:9222"
}
```

### Security Note

CDP connections are restricted to localhost for security. The agent can only connect to browsers running on your local machine.

## Managed Mode

Launch an isolated browser instance with a clean profile.

```json
{
  "action": "connect",
  "mode": "managed",
  "headless": false
}
```

### Options

- `headless: true` - Run without visible window (faster, no UI)
- `headless: false` - Show browser window (see what agent is doing)

## Actions

### Browser Use Action Surface

In addition to WindieOS compatibility actions (`connect`, `navigate`, `snapshot`, `click`, `type`, etc.), `browser_control` now exposes Browser Use-style action names directly:

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

Initialize browser connection.

```json
{
  "action": "connect",
  "mode": "user_chrome",
  "cdp_url": "http://127.0.0.1:9222"
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
Runtime requirement: set `WINDIE_BROWSER_USE_EXTRACTION_MODEL` to a Browser Use model name (for example `openai_gpt_4o_mini`).

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
- `upload` -> Browser Use `upload_file`
- `get_tabs` / `status` -> Browser Use state summary bridge

Deprecated legacy actions (`ACTION_DEPRECATED`):

- `console`, `errors`, `requests`, `pdf`, `dialog`
- `cookies`, `cookies_set`, `cookies_clear`
- `storage_get`, `storage_set`, `storage_clear`
- `set_offline`, `set_headers`, `set_credentials`, `set_geolocation`, `set_media`
- `set_timezone`, `set_locale`, `set_device`
- `act` legacy kinds: `hover`, `drag`, `select`, `fill`, `resize`

## Example Workflows

### Search on Google

```json
// 1. Connect to browser
{"action": "connect", "mode": "user_chrome"}

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
{"action": "connect", "mode": "managed"}
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
{"action": "connect", "mode": "user_chrome"}

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

### Cannot Connect to Chrome

**Error:** `Cannot connect to Chrome at http://127.0.0.1:9222`

**Solutions:**

1. **Auto-launch** (recommended): The agent will connect to an existing CDP-enabled Chrome instance, or launch Chrome with CDP if Chrome is not running.
   If Chrome is already running without CDP, WindieOS will not restart that process automatically; restart Chrome manually with `--remote-debugging-port=9222`.

2. **Manual launch** (if auto-launch fails):
   ```bash
   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

   # Linux
   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome-cdp" --profile-directory="Default"

   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

3. Check no other process is using port 9222:
   ```bash
   lsof -i :9222  # macOS/Linux
   netstat -ano | findstr :9222  # Windows
   ```

4. Try a different port:
   ```bash
   google-chrome --remote-debugging-port=9223
   ```
   Then use `"cdp_url": "http://127.0.0.1:9223"`

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
