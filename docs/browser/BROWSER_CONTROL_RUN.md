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

`browser_use` is vendored in this repository at `frontend/src/main/python/tools/browser/browser_use`, so no pip install of the `browser-use` package is required.

Vendored Browser Use sync is currently manual (no in-repo helper script):

- Copy updates from `../browser-use/browser_use` into `frontend/src/main/python/tools/browser/browser_use`.
- Update `frontend/src/main/python/tools/browser/browser_use_vendor_manifest.json` (`source_commit`, `synced_at_utc`, `pruned_paths`) after each sync.

To verify vendored parity + import origin:

```bash
cd WindieOS
python -m pytest tests/sidecar/tools/test_browser_use_tool_parity.py -q
```

This check also enforces that sidecar requirements do not reintroduce `browser-use` as a pip dependency.
It also enforces Browser Use action parity across sidecar schema, backend schema, native handlers, and adapter dispatch coverage.

### Step 2: Run WindieOS

**Terminal 1 - Backend:**
```bash
cd WindieOS
./scripts/run-backend
```

**Terminal 2 - Frontend:**
```bash
cd WindieOS
./scripts/run-frontend-electron
```

**Then in the chat:**
```
Connect to my browser and go to Amazon
```

### Optional Runtime Flags

Browser Use runtime is now the default execution path. These flags are optional:

```bash
# Browser Use-native runtime (default; optional explicit alias)
export WINDIE_BROWSER_USE_RUNTIME=browser_use_native

# Optional: use a custom native handler module
export WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE=tools.browser.browser_tool
```

That's it! WindieOS connect now targets a dedicated Windie browser instance/profile:
- If Windie browser is already running, it attaches to that instance.
- If not, it launches the Windie browser instance automatically.
- Your default browser process/profile is not modified.

**Terminal 1 - Backend:**
```bash
cd WindieOS
export OPENAI_API_KEY="your-key"  # Optional, for real LLM
./scripts/run-backend
```

**Terminal 2 - Frontend:**
```bash
cd WindieOS
./scripts/run-frontend-electron
```

**Then in the chat:**
```
Connect to my browser and go to Amazon
```

## Demo Mode (No API Key Required)

Use the mock LLM client to see browser control in action without spending API credits.

### Option A: Mock Browser Client (Amazon Shoes Demo)

**1. Start Chrome with CDP** (as shown above)

**2. Modify backend to use mock client:**

Edit `backend/src/core/config/app_config.py`:
```python
# Add to your config
LLM_CLIENT = "mock_browser"  # Use this instead of real LLM
```

Or set environment variable:
```bash
export WINDIEOS_LLM_CLIENT="mock_browser"
```

**3. Run backend:**
```bash
cd WindieOS
./scripts/run-backend
```

The mock client will automatically:
- Connect to your Chrome
- Navigate to Amazon
- Search for "shoes"
- Sort by price (low to high)
- Click the cheapest shoe
- Take a screenshot

### Option B: Mock Computer-Use Client (Original)

For the original mouse/keyboard simulation:

```bash
export WINDIEOS_LLM_CLIENT="mock"
./scripts/run-backend
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

### Test Browser Controller

```bash
cd WindieOS/frontend/src/main/python
python -c "
import asyncio
from tools.browser.controller import get_browser_controller

async def test():
    controller = get_browser_controller()
    result = await controller.connect_to_user_chrome()
    print(f'Connected: {result}')
    
    result = await controller.navigate('https://example.com')
    print(f'Navigated: {result}')
    
    snapshot = await controller.get_page_snapshot()
    print(f'Snapshot: {snapshot.text[:200]}...')
    
    await controller.close()

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
        'mode': 'user_chrome'
    })
    print(f'Connect: {result}')
    
    # Navigate
    result = await registry.execute_tool('browser', {
        'action': 'navigate',
        'url': 'https://example.com'
    })
    print(f'Navigate: {result}')

asyncio.run(test())
"
```

## Running Tests

```bash
cd WindieOS

# Chrome detection tests
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_chrome_detection.py -v

# Browser schema tests
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_schemas.py -v

# Browser tool tests (requires playwright)
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py -v

# Backend browser tests
./scripts/python-in-env backend python -m pytest tests/backend/test_browser_remote_tool.py -v

# Mock browser client tests
./scripts/python-in-env backend python -m pytest tests/backend/test_mock_llm_browser_client.py -v

# All browser tests
./scripts/python-in-env backend python -m pytest tests/backend -k browser -v
./scripts/python-in-env sidecar python -m pytest tests/sidecar -k browser -v
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
{"action": "click", "ref": "3"}
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

**Problem:** Windie dedicated browser instance failed to launch/attach

**Fix:**
```bash
# Check Windie CDP port listener
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

**Fix:** Set a different Windie browser CDP port:
```bash
export WINDIE_BROWSER_CDP_PORT=9334
```

### Extension Badge Shows "OFF"

**Problem:** Extension not connected to sidecar

**Fix:**
1. Make sure WindieOS Electron app is running
2. Check that sidecar started properly
3. Look for errors in Electron console (Ctrl+Shift+I)

## Advanced Usage

### Windie Dedicated Browser

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
{"action": "evaluate", "script": "alert('Hello')"}
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
# Windie browser CDP port (default: 9333)
export WINDIE_BROWSER_CDP_PORT=9333

# Use mock LLM for testing
export WINDIEOS_LLM_CLIENT="mock_browser"

# Playwright browser path (optional)
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"
```

## Next Steps

- Read the full [Browser Control Documentation](BROWSER_CONTROL.md)
- Check ADR 004 (`docs/adr/004-browser-extension-auto-attach.md`) for future extension mode
- See [Tool Development Guide](../development/TOOL_DEVELOPMENT.md) to extend browser capabilities
