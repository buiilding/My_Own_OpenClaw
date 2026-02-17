---
summary: "Browser Extension Auto-Attach for User Chrome"
read_when:
  - Implementing browser control without CDP restart requirement
  - Understanding extension-based browser control
  - Setting up Chrome extension for WindieOS
---

# ADR 004: Browser Extension Auto-Attach for User Chrome Control

## Status

Proposed - Pending Implementation

## Context

The current `browser` implementation (see `docs/BROWSER_CONTROL.md`) requires users to start Chrome with `--remote-debugging-port=9222`. This is a significant friction point:

- Users must restart their browser
- Loses current session state unless "Continue where you left off" is enabled
- Power-user feature, not accessible to casual users

We need a way to control the user's **already-running Chrome** without restart.

## Decision

Implement a **Chrome Extension** that:
1. Uses `chrome.debugger` API to attach to the **active tab only**
2. Auto-switches debugger attachment when user changes tabs
3. Communicates with WindieOS sidecar via WebSocket relay
4. Can be installed automatically by the agent using computer-use tools

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  WindieOS       │     │  Chrome          │     │  User's Chrome  │
│  Sidecar        │◄───►│  Extension       │◄───►│  (Active Tab)   │
│  (Python)       │ WS  │  (MV3)           │ CDP │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        │ WebSocket
        ▼
┌─────────────────┐
│  Backend/Agent  │
│  (LLM decides   │
│   actions)      │
└─────────────────┘
```

### Key Design: Active Tab Only (Not All Tabs)

Instead of attaching to ALL tabs (performance nightmare, warning bars everywhere), we attach to **only the currently active tab** and auto-switch:

```javascript
// extension/background.js - Smart auto-switch

let activeTabId = null;

// When user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Detach from previous tab
  if (activeTabId) {
    await chrome.debugger.detach({ tabId: activeTabId });
  }
  
  // Attach to new active tab
  await chrome.debugger.attach({ tabId }, "1.3");
  activeTabId = tabId;
  
  // Notify sidecar of tab switch
  notifySidecar({ type: "tab_changed", tabId });
});
```

**Benefits:**
- Only 1 tab attached at a time (good performance)
- Always controls what user is looking at
- Single warning bar (not 20)
- Can still list all tabs (via `chrome.tabs.query` - no debugger needed)
- Can switch to any tab (via `chrome.tabs.update` - makes it active)

## Files to Create

### 1. Extension Files
```
assets/chrome-extension/
├── manifest.json          # MV3 manifest, permissions
├── background.js          # Service worker, debugger attachment
├── content.js             # (optional) Page interaction helpers
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 2. Sidecar Extension Relay
```
frontend/src/main/python/tools/browser/
├── extension_relay.py     # WebSocket server for extension
```

### 3. Updated Browser Controller
```
frontend/src/main/python/tools/browser/
├── controller.py          # Add extension mode alongside CDP mode
```

## Extension Manifest (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "WindieOS Browser Control",
  "version": "1.0.0",
  "description": "Allow WindieOS to control your browser for automation tasks",
  "permissions": [
    "debugger",
    "activeTab",
    "tabs"
  ],
  "host_permissions": [
    "http://localhost/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## Extension Background Script (background.js)

```javascript
// WebSocket connection to sidecar
let ws = null;
let activeTabId = null;

// Connect to sidecar relay
function connectToSidecar() {
  ws = new WebSocket('ws://localhost:19222/extension');
  
  ws.onopen = () => {
    console.log('WindieOS: Connected');
    updateBadge('ON');
  };
  
  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    const result = await handleCommand(msg);
    ws.send(JSON.stringify(result));
  };
  
  ws.onclose = () => {
    console.log('WindieOS: Disconnected');
    updateBadge('OFF');
    // Detach from all tabs on disconnect
    if (activeTabId) {
      chrome.debugger.detach({ tabId: activeTabId });
      activeTabId = null;
    }
  };
}

// Handle commands from sidecar
async function handleCommand(cmd) {
  switch (cmd.type) {
    case 'list_tabs':
      const tabs = await chrome.tabs.query({});
      return { type: 'tabs', tabs: tabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        active: t.active,
        index: t.index
      }))};
      
    case 'switch_tab':
      await chrome.tabs.update(cmd.tabId, { active: true });
      return { type: 'switched', tabId: cmd.tabId };
      
    case 'debugger_command':
      // Forward CDP command to active tab
      if (!activeTabId) return { error: 'No active tab' };
      const result = await sendDebuggerCommand(cmd.method, cmd.params);
      return { type: 'result', result };
      
    default:
      return { error: 'Unknown command' };
  }
}

// Send CDP command via chrome.debugger
function sendDebuggerCommand(method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId: activeTabId },
      method,
      params,
      (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Auto-attach to active tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Detach from old tab
  if (activeTabId && activeTabId !== tabId) {
    try {
      await chrome.debugger.detach({ tabId: activeTabId });
    } catch (e) {
      // May already be detached
    }
  }
  
  // Attach to new tab
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    activeTabId = tabId;
    
    // Notify sidecar
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'tab_changed',
        tabId: tabId
      }));
    }
  } catch (e) {
    console.error('Failed to attach debugger:', e);
  }
});

// Initial connect
connectToSidecar();

// Update extension badge
function updateBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: text === 'ON' ? '#00AA00' : '#FF0000'
  });
}
```

## Sidecar Extension Relay (extension_relay.py)

```python
"""
WebSocket relay server for Chrome Extension communication.
Bridges between extension and Playwright.
"""

import asyncio
import json
import logging
from typing import Optional

import websockets
from websockets.server import WebSocketServerProtocol

logger = logging.getLogger(__name__)


class ExtensionRelayServer:
    """
    Relay server that bridges Chrome Extension CDP to Playwright.
    
    Runs on localhost:19222 (configurable)
    Accepts connections from chrome-extension:// origins
    """
    
    def __init__(self, host: str = "localhost", port: int = 19222):
        self.host = host
        self.port = port
        self.server = None
        self.extension_ws: Optional[WebSocketServerProtocol] = None
        self.pending_commands: dict = {}
        self.command_id = 0
    
    async def start(self):
        """Start the relay server."""
        self.server = await websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
        )
        logger.info(f"Extension relay running on ws://{self.host}:{self.port}")
    
    async def stop(self):
        """Stop the relay server."""
        if self.extension_ws:
            await self.extension_ws.close()
        if self.server:
            self.server.close()
            await self.server.wait_closed()
    
    async def _handle_connection(self, websocket: WebSocketServerProtocol, path: str):
        """Handle incoming WebSocket connection."""
        # Verify it's from Chrome extension (check origin)
        origin = websocket.request_headers.get("Origin", "")
        if not origin.startswith("chrome-extension://"):
            logger.warning(f"Rejected connection from {origin}")
            await websocket.close(1008, "Extension only")
            return
        
        logger.info(f"Extension connected from {origin}")
        self.extension_ws = websocket
        
        try:
            async for message in websocket:
                await self._handle_message(json.loads(message))
        except websockets.exceptions.ConnectionClosed:
            logger.info("Extension disconnected")
        finally:
            self.extension_ws = None
    
    async def _handle_message(self, msg: dict):
        """Handle message from extension."""
        msg_type = msg.get("type")
        
        if msg_type == "tab_changed":
            logger.info(f"Active tab changed to: {msg.get('tabId')}")
            # Notify browser controller
        elif msg_type == "result":
            # CDP command result
            pass
    
    async def send_command(self, method: str, params: dict = None) -> dict:
        """Send CDP command to extension."""
        if not self.extension_ws:
            raise RuntimeError("Extension not connected")
        
        self.command_id += 1
        cmd = {
            "id": self.command_id,
            "type": "debugger_command",
            "method": method,
        }
        if params:
            cmd["params"] = params
        
        await self.extension_ws.send(json.dumps(cmd))
        
        # Wait for response (simplified)
        # Real implementation needs async response handling
        return {"status": "sent"}
```

## Updated Browser Tool Schema

Add new mode to existing schema:

```python
class BrowserConnectArgs(BaseModel):
    action: Literal["connect"] = Field(...)
    mode: Literal["user_chrome", "managed", "extension"] = Field(
        "extension",
        description="Connection mode: 'extension' uses Chrome extension (no restart needed)"
    )
    # ... existing fields
```

## Installation: Agent Automates It

The agent has **computer-use capabilities** (mouse, keyboard, screenshot). When user wants browser control:

**Scenario: Extension not installed**
```
User: "Help me book a flight on the United tab"
Agent: "I'll need to install the WindieOS browser extension first. One moment..."

Agent actions:
1. screenshot() - see current state
2. run_shell_command("google-chrome") - ensure Chrome is open
3. browser(action="navigate", url="chrome://extensions")
4. screenshot() - locate Developer mode toggle
5. mouse_control(action="click", x=..., y=...) - enable Developer mode
6. screenshot() - locate "Load unpacked"
7. mouse_control(action="click", x=..., y=...) - click button
8. keyboard_control(action="type", text="/path/to/WindieOS/assets/chrome-extension")
9. keyboard_control(action="press", key="Enter")
10. screenshot() - verify extension installed (green "ON" badge)
11. browser(action="connect", mode="extension")
12. Continue with flight booking task...
```

This **procedural knowledge** should be in `skills.md` or agent's procedural memory:

```markdown
## Skill: Browser Extension Installation

Trigger: User requests browser but extension not detected

Steps:
1. Open Chrome (if not open)
2. Navigate to chrome://extensions
3. Enable Developer mode (toggle top-right)
4. Click "Load unpacked"
5. Navigate to {WINDIEOS_PATH}/assets/chrome-extension
6. Click "Select Folder"
7. Verify extension shows "ON" badge
8. Connect browser with mode="extension"

Expected outcome: Extension installed and connected
```

## Comparison: CDP vs Extension Mode

| Feature | CDP Mode | Extension Mode |
|---------|----------|----------------|
| Setup | Restart Chrome with flag | Install extension once |
| Auto-start | No | Yes (Chrome loads extension) |
| Attach to | All tabs | Active tab only |
| Switch tabs | Native CDP | Via `chrome.tabs` API |
| Screenshot | Yes | Yes (via CDP) |
| Network interception | Yes | Limited |
| Console access | Yes | Yes |
| User sees | Nothing | Extension badge |

## Migration Path

1. **Phase 1** (Current): CDP mode only
2. **Phase 2**: Add extension mode alongside CDP
3. **Phase 3**: Make extension the default for "user_chrome"
4. **Phase 4**: Deprecate CDP mode (optional)

## Decision Outcome

**APPROVED**: Implement Chrome Extension with active-tab auto-switching as the primary method for controlling user's existing Chrome without restart.

CDP mode remains as fallback for:
- Power users who prefer it
- Headless scenarios
- Enterprise locked-down Chrome (no extensions)

## References

- Current implementation: `docs/BROWSER_CONTROL.md`
- Chrome Debugger API: https://developer.chrome.com/docs/extensions/reference/debugger/
- MV3 Service Workers: https://developer.chrome.com/docs/extensions/mv3/service_workers/
