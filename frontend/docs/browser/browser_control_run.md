---
summary: "How to Run Browser Control"
read_when:
  - Running browser for the first time
  - Testing the browser automation
---

# How to Run Browser Control

## Quick Start (2 Steps)

### Step 1: Install Python Browser Dependencies

```bash
cd WindieOS/frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

Browser Use runtime dependencies are installed from the local-runtime Python
requirements and provide the maintained browser automation engine.

To verify the dedicated browser runtime boundary:

```bash
cd WindieOS
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
```

### Step 2: Run WindieOS

**Terminal 1 - Backend:**
```bash
cd WindieOS
private backend start command
```

**Terminal 2 - Frontend:**
```bash
cd WindieOS
<windie> start desktop
```

**Then in the chat:**
```
Connect to my browser and go to Amazon
```

### Optional Runtime Flags

Browser Use runtime is now the default execution path. These flags are optional:

```bash
# Browser Use daemon/session state root
export AGENT_BROWSER_USE_HOME="$HOME/.config/desktop-runtime/browser-use"

# Browser Use session name (default: desktop-agent)
export AGENT_BROWSER_USE_SESSION=desktop-agent

# Optional diagnostic command override
export AGENT_BROWSER_USE_CLI=browser-use
```

That's it. The local-runtime browser adapter now targets the named Browser Use
daemon session:
- If that Browser Use session is already running, the adapter reuses it.
- If not, Browser Use starts the browser session automatically.
- The hosted backend keeps agent orchestration and policy, Electron UI owns
  readiness/status controls, and the local-runtime adapter normalizes Browser
  Use results.

**Terminal 1 - Backend:**
```bash
cd WindieOS
export OPENAI_API_KEY="your-key"  # Optional, for real LLM
private backend start command
```

**Terminal 2 - Frontend:**
```bash
cd WindieOS
<windie> start desktop
```

**Then in the chat:**
```
Connect to my browser and go to Amazon
```

## Demo Mode (No API Key Required)

Use the mock LLM client to see browser control in action without spending API credits.

### Option A: Mock Browser Client (Amazon Shoes Demo)

**1. Configure the backend to use the mock browser client:**

Edit private backend implementation:
```python
# Add to your config
LLM_CLIENT = "mock_browser"  # Use this instead of real LLM
```

Or set environment variable:
```bash
export WINDIEOS_LLM_CLIENT="mock_browser"
```

**2. Run backend:**
```bash
cd WindieOS
private backend start command
```

The mock client will automatically:
- Connect to the Browser Use session through the local-runtime adapter
- Navigate to Amazon
- Search for "shoes"
- Sort by price (low to high)
- Click the cheapest shoe
- Take a screenshot

### Option B: Mock Computer-Use Client (Original)

For the original mouse/keyboard simulation:

```bash
export WINDIEOS_LLM_CLIENT="mock"
private backend start command
```

This opens Chrome and uses OCR/vision to navigate Amazon.

## Testing Individual Components

### Test Chrome Detection

```bash
cd WindieOS/frontend/src/main/python
python -c "
from tools.browser.chrome_detection import find_chrome_executable
exe = find_chrome_executable()
print(f'Found: {exe}')
"
```

### Test Browser Use Engine Adapter

```bash
cd WindieOS/frontend/src/main/python
python -c "
import asyncio
from tools.browser.browser_use_engine import BrowserUseEngineRuntime
from windie_shared.browser_contract import BrowserControlArgs

async def test():
    runtime = BrowserUseEngineRuntime()
    result = await runtime.execute(BrowserControlArgs.model_validate({
        'action': 'connect',
        'explanation': 'Open the Browser Use session for a smoke test.'
    }))
    print(f'Connected: {result}')
    
    result = await runtime.execute(BrowserControlArgs.model_validate({
        'action': 'navigate',
        'url': 'https://example.com',
        'explanation': 'Navigate during a smoke test.'
    }))
    print(f'Navigated: {result}')
    
    snapshot = await runtime.execute(BrowserControlArgs.model_validate({
        'action': 'snapshot',
        'explanation': 'Read Browser Use state during a smoke test.'
    }))
    print(f'Snapshot: {snapshot["output"][:200]}...')
    
    await runtime.execute(BrowserControlArgs.model_validate({
        'action': 'close',
        'explanation': 'Close the Browser Use session after a smoke test.'
    }))

asyncio.run(test())
"
```

### Test via Tool Registry

```bash
cd WindieOS/frontend/src/main/python
python -c "
import asyncio
from tools.registry import ToolRegistry

async def test():
    registry = ToolRegistry()
    
    # Connect to browser
    result = await registry.execute_tool('browser', {
        'action': 'connect',
        'explanation': 'Open the Browser Use session for a smoke test.'
    })
    print(f'Connect: {result}')
    
    # Navigate
    result = await registry.execute_tool('browser', {
        'action': 'navigate',
        'url': 'https://example.com',
        'explanation': 'Navigate during a smoke test.'
    })
    print(f'Navigate: {result}')

asyncio.run(test())
"
```

## Running Tests

```bash
cd WindieOS

# Chrome detection tests
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_chrome_detection.py -v

# Browser schema tests
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_schemas.py -v

# Browser tool tests (requires playwright)
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_tool.py -v

# Backend browser tests
private backend test runner

# Mock browser client tests
private backend test runner

# All browser tests
private backend test runner
./scripts/python-in-env local-runtime python -m pytest tests/sidecar -k browser -v
```

## Action Surface Note

- Legacy non-Browser Use actions (`trace_*`, `console`, `errors`, `requests`, `cookies*`, `storage*`, `set_*`, `pdf`, `dialog`, `upload`) are no longer routed at runtime and return `Unhandled action`.

## Using Browser Control via Chat

### Basic Workflow

**1. Connect to browser:**
```
Connect to my Chrome browser
```

Agent executes:
```json
{"action": "connect"}
```

**2. Navigate to a website:**
```
Go to github.com
```

Agent executes:
```json
{"action": "navigate", "url": "https://github.com"}
```

**3. Get page snapshot:**
```
What do you see on the page?
```

Agent executes:
```json
{"action": "snapshot"}
```

**4. Extract targeted content (optional, useful for long pages):**
```
Extract pricing tiers and monthly cost from this page
```

Agent can execute:
```json
{"action": "extract", "query": "pricing tiers and monthly cost", "extract_links": false}
```

**5. Interact with elements:**
```
Click on the Sign in button
```

Agent executes:
```json
{"action": "click", "index": 3}
```

### Example Session

```
User: Open my browser and go to Amazon
[Agent connects to Chrome, navigates to Amazon]

User: Search for wireless headphones
[Agent finds search box via snapshot, types "wireless headphones", submits]

User: Sort by price lowest first
[Agent clicks sort dropdown, selects "Price: Low to High"]

User: Click on the cheapest one
[Agent clicks first product]

User: Take a screenshot
[Agent captures full page screenshot]

User: Close the browser
[Agent closes connection]
```

## Troubleshooting

### "Cannot connect to Chrome"

**Problem:** Dedicated browser instance failed to launch/attach

**Fix:**
```bash
# Check dedicated browser CDP port listener
lsof -i :9333  # Linux/Mac
netstat -ano | findstr :9333  # Windows
```

Then retry:
```json
{"action":"connect"}
```

### "ModuleNotFoundError: No module named 'playwright'" / "No module named 'browser_use'"

**Fix:**
```bash
cd WindieOS/frontend/src/main/python
pip install -r requirements.txt
playwright install chromium
```

### "No Chrome executable found"

**Fix:** Install Chrome or Chromium:

**Ubuntu/Debian:**
```bash
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update
sudo apt-get install google-chrome-stable
```

**macOS:**
```bash
brew install --cask google-chrome
```

**Windows:** Download from https://google.com/chrome

### "Port 9333 already in use"

**Fix:** Set a different dedicated browser CDP port:
```bash
export AGENT_BROWSER_CDP_PORT=9334
```

### Extension Badge Shows "OFF"

**Problem:** Extension not connected to the local runtime

**Fix:**
1. Make sure the desktop Electron app is running
2. Check that the local runtime started properly
3. Look for errors in Electron console (Ctrl+Shift+I)

## Advanced Usage

### Dedicated Desktop Browser

```
Open the browser and go to example.com
```

Agent uses:
```json
{"action": "connect"}
```

### JavaScript Evaluation

```
Go to example.com and run alert("Hello")
```

Agent executes:
```json
{"action": "evaluate", "code": "alert('Hello')"}
```

### Multi-Tab Operations

```
Open GitHub in a new tab
```

Agent:
1. Gets current tabs: `{"action": "get_tabs"}`
2. Opens new tab (via navigate or keyboard shortcut)
3. Switches between tabs as needed

## Configuration

### Environment Variables

```bash
# Dedicated browser CDP port (default: 9333)
export AGENT_BROWSER_CDP_PORT=9333

# Browser Use session name (default: desktop-agent)
export AGENT_BROWSER_USE_SESSION=desktop-agent
```

## Next Steps

- Read the full [Browser Control Documentation](browser_control.md)
- Check ADR 004 (`docs/adr/004-browser-extension-auto-attach.md`) for future extension mode
- See Backend Tool Development (private backend docs) to extend browser capabilities
