---
summary: "Browser Control Tool"
read_when:
  - Setting up browser automation
  - Using browser_control tool
  - Troubleshooting browser connection
---

# Browser Control

WindieOS provides a powerful **browser control tool** that allows the AI agent to automate web browsers for online tasks.

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
google-chrome --remote-debugging-port=9222
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

Get page overview with numbered element references.

```json
{
  "action": "snapshot",
  "format": "ai",
  "max_chars": 5000
}
```

**AI Format Output:**
```
Title: GitHub
URL: https://github.com

[1] link "Sign in"
[2] link "Sign up"
[3] searchbox "Search"
[4] button "Search GitHub"
```

**ARIA Format Output:**
```
- heading: "Let's build from here"
- link: "Sign in"
- searchbox: "Search"
```

### 4. Click

Click an element by reference.

```json
{
  "action": "click",
  "ref": "1",
  "button": "left"
}
```

Options:
- `double_click: true` - Double click
- `button: "right"` - Right click

### 5. Type

Type text into an input.

```json
{
  "action": "type",
  "ref": "3",
  "text": "windieos",
  "submit": true
}
```

### 6. Press

Press a keyboard key.

```json
{
  "action": "press",
  "key": "Enter"
}
```

Common keys: `Enter`, `Escape`, `Tab`, `ArrowDown`, `ArrowUp`, `F5`

### 7. Scroll

Scroll the page.

```json
{
  "action": "scroll",
  "direction": "down",
  "amount": 500
}
```

Directions: `up`, `down`, `left`, `right`

### 8. Screenshot

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

### 9. Wait

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

### 10. Get Tabs

List open tabs.

```json
{
  "action": "get_tabs"
}
```

### 11. Switch Tab

Switch to a specific tab.

```json
{
  "action": "switch_tab",
  "target_id": "abc123"
}
```

### 12. Evaluate

Execute JavaScript.

```json
{
  "action": "evaluate",
  "script": "window.location.href"
}
```

### 13. Close

Close browser connection.

```json
{
  "action": "close"
}
```

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
   google-chrome --remote-debugging-port=9222

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
1. Re-run `snapshot` - refs change after page updates
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

1. **Always snapshot before interacting** - Element refs change on navigation
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
