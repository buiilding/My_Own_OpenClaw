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

- Default behavior: prefer Browser Use native runtime when `browser_use` is installed; otherwise fall back to controller-backed runtime.
- Force runtime: set `WINDIE_BROWSER_USE_RUNTIME=controller` or `WINDIE_BROWSER_USE_RUNTIME=browser_use_native`.
- Strict mode: set `WINDIE_BROWSER_USE_RUNTIME_STRICT=1` to fail instead of silent fallback.
- Action-level native overrides: `WINDIE_BROWSER_USE_NATIVE_ACTIONS` (comma-separated, for example `wait_seconds`) with optional strict mode `WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT=1`.

## Overview

The `browser_control` tool supports two modes:

1. **User Chrome Mode** - Control your existing Chrome browser with all your logins and cookies
2. **Managed Mode** - Launch an isolated Chromium instance for safe automation

## Installation

### Prerequisites

```bash
# Install Playwright browsers (run once)
cd frontend/src/main/python
pip install playwright
playwright install chromium
```

## User Chrome Mode

Connect to your existing Chrome browser for full access to your logged-in sessions.

### Auto-Launch (Recommended)

**No manual setup required!** When you say:
```
Connect to my browser and go to Amazon
```

The agent will **automatically**:
1. Check if Chrome is running with CDP enabled → connect to it
2. If Chrome is running without CDP → restart it with CDP (restores your tabs)
3. If Chrome is not running → launch it with CDP

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
  "url": "https://github.com",
  "wait_until": "networkidle"
}
```

Wait options: `load`, `domcontentloaded`, `networkidle`, `commit`

### 3. Snapshot

Get page overview with element references and optional rich contextual role snapshots.

Notes:
- Refs are designed to be stable across repeated snapshots on the same page/tab, but can still change if the page navigates or the DOM replaces elements.
- Newly-appeared interactive elements since the last snapshot are prefixed with `*` (example: `*[12]`).
- `format="ai"` snapshots use an enhanced CDP pipeline (`DOMSnapshot` + full DOM + AX tree + JS click-listener hints) to identify interactive elements more reliably than selector-only scanning.
- If the enhanced CDP path fails, WindieOS automatically falls back to the legacy selector-based snapshot path for resilience.

```json
{
  "action": "snapshot",
  "format": "ai",
  "max_chars": 12000
}
```

**AI Format Output:**
```
Title: GitHub
URL: https://github.com

DOM tree (browser-use style):
<main#site-content>
	[1]<a role='link' href='/login'>Sign in</a>
	[2]<a role='link' href='/signup'>Sign up</a>
	[3]<input role='searchbox' type='search'>Search</input>
	[4]<button role='button'>Search GitHub</button>
```

**Role Snapshot (OpenClaw-style, more context control):**
```json
{
  "action": "snapshot",
  "format": "ai",
  "mode": "efficient"
}
```
```
Title: GitHub
URL: https://github.com

- link "Sign in" [ref=e1]
- link "Sign up" [ref=e2]
- searchbox "Search" [ref=e3]
- button "Search GitHub" [ref=e4]
```

**ARIA Format Output:**
```
- heading: "Let's build from here"
- link: "Sign in"
- searchbox: "Search"
```

Snapshot options:
- `format`: `ai` (default) or `aria`
- `wait_until`: load state to wait for before capture (`load` default; supports `domcontentloaded`, `networkidle`, and `commit` where `commit` is treated as `load` for snapshot capture)
- `max_chars`: optional capture budget for snapshot text before pagination (`ai` supports caller-defined values; `aria` defaults to `4000`)
- `offset`: optional character offset for paginated snapshot reads
- `limit`: optional character page size for paginated snapshot reads (`aria` page size is capped at `4000`)
- `mode: "efficient"`: sets `interactive=true`, `compact=true`, `depth=4`, and `max_chars=4000` (unless you pass `max_chars`)
- `interactive`: only interactive roles in role snapshot
- `compact`: prune structural noise in role snapshot
- `depth`: max role snapshot depth
- `selector`: scope role snapshot to a CSS selector
- `frame`: scope role snapshot to an iframe selector
- `refs`: `role` (default) or `aria`

Defaults:
- Snapshot waits for `wait_until="load"` before capture (for both manual `snapshot` and automatic post-action snapshots)
- `ai` snapshots default to `mode="efficient"` when mode is omitted
- `ai` snapshot default page budget: `4000` chars (efficient default behavior)
- `ai` non-efficient budget: `12000` chars
- `aria` snapshot default page budget: `4000` chars
- If efficient AI snapshot capture returns `ref_count=0`, WindieOS retries with a deeper role snapshot (`depth=12`) and then an unscoped flat AI snapshot fallback.
- Snapshot tool output returns `snapshot` text plus lightweight metadata (`ref_count`, `offset`, `limit`, `returned_chars`, `total_chars`, `has_more`, `next_offset` when available); detailed ref/stats maps remain internal to reduce token usage.

Pagination example:
```json
{
  "action": "snapshot",
  "format": "aria",
  "offset": 4000,
  "limit": 4000
}
```

Automatic post-action snapshots:
- Temporarily disabled for testing.
- Use explicit `snapshot` calls after actions when you need updated page refs/metadata.

### 4. Extract

Extract page content using focused text filtering, full-text windows, or structured DOM captures.

```json
{
  "action": "extract",
  "query": "list all pricing tiers and monthly cost"
}
```

Extract options:
- `query` (required): what to extract from the current page.
- `mode`: `focused` (default keyword-focused excerpt), `full_text` (unfiltered source window), or `structured` (JSON window derived from detected tables/lists).
- `wait_until`: load state to wait for before extraction (`load` default; supports `domcontentloaded`, `networkidle`, `commit`).
- `extract_links`: include link lines (`text -> href`) in source text before query filtering (`false` default).
- `start_from_char`: continue extraction from a character offset for long pages (`0` default).
- `max_chars`: max characters returned in `result` (`12000` default).
- `selector`: optional CSS selector to scope extraction to part of the page.
- `frame`: optional iframe selector for scoped extraction.
- `output_schema`: optional schema hint metadata (accepted but not enforced in sidecar extraction).

Extract output includes:
- `result`: extracted text window (query-focused for `focused`, raw window for `full_text`, JSON text window for `structured`).
- `structured`: parsed table/list payload when `mode="structured"` and DOM structures are detected.
- `extracted_content`: tagged payload (`<url>`, `<query>`, `<result>`) for agent context.
- pagination/source metadata: `start_from_char`, `next_start_char`, `has_more_source`, `source_window_chars`, `total_source_chars`.
- diagnostics: `returned_chars`, `extract_links`, `wait_until`, `url`, `title`, `mode`.

### 5. Click

Click an element by reference.

```json
{
  "action": "click",
  "ref": "1",
  "button": "left"
}
```

`ref` can be numeric (`"12"`) or role-based (`"e12"`).

Options:
- `double_click: true` - Double click
- `button: "right"` - Right click

Click fallback behavior:
- If normal click fails with recoverable actionability errors (for example pointer interception), WindieOS may use fallback strategies.
- For native `<select>/<option>` targets, WindieOS now attempts `select_option` before force-click; tool output reports `strategy: "select_option"` when this path is used.

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

## OpenClaw Compatibility Actions

WindieOS now supports OpenClaw-style action names (compatibility layer):

- `status` -> session status summary
- `open` -> opens a new tab and navigates
- `pdf` -> returns PDF bytes (base64)
- `act` -> envelope action with `request.kind`
- `profiles` -> returns WindieOS profile equivalents
- `upload` -> set file input files by `inputRef`/`ref`
- `console` -> returns captured console messages for the active tab (`level`, `limit`, `clear`)
- `dialog` -> arms next JS dialog handling (`accept`, `promptText`) and can optionally wait (`timeoutMs`)
- `errors` / `requests` -> page errors + network request history
- `trace_start` / `trace_stop` -> deprecated (`ACTION_DEPRECATED`); use `requests`/`errors` capture and HAR-style runbook workflows instead
- `cookies`, `cookies_set`, `cookies_clear`
- `storage_get`, `storage_set`, `storage_clear` (`kind: local|session`)
- `set_offline`, `set_headers`, `set_credentials`, `set_geolocation`, `set_media`
- `set_timezone`, `set_locale`, `set_device`

Notes:
- `dialog` is one-shot per arm call; call it again to arm the next dialog.
- Screenshot parity: `screenshot` supports `type: "png"|"jpeg"`, `quality` (jpeg), and CSS `element` targeting.

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
{"action": "wait", "state": "networkidle"}

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
{"action": "screenshot", "full_page": true}

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

1. **Auto-launch** (recommended): The agent automatically launches Chrome with CDP. Simply say "Connect to my browser" and it handles the rest, including restarting Chrome with the debugging flag if needed.

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

### Playwright Not Found

**Error:** `ModuleNotFoundError: No module named 'playwright'`

**Solution:**
```bash
pip install playwright
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
