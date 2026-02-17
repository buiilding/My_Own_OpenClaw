---
summary: "How to Run Browser Control"
read_when:
  - Running browser_control for the first time
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

# Strict handler mode for diagnostics (optional)
export WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT=1
```

That's it! WindieOS will connect to an existing CDP-enabled Chrome, or launch Chrome with CDP if Chrome is not running.

If Chrome is already running without CDP, restart Chrome manually with `--remote-debugging-port=9222`.

**Optional:** If you prefer to use an already-running Chrome window, start it with:

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
    result = await registry.execute_tool('browser_control', {
        'action': 'connect',
        'mode': 'user_chrome'
    })
    print(f'Connect: {result}')
    
    # Navigate
    result = await registry.execute_tool('browser_control', {
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

## Deprecation Note

- `trace_start` and `trace_stop` are deprecated in Browser Use runtime migration and return `ACTION_DEPRECATED`.

## Using Browser Control via Chat

### Basic Workflow

**1. Connect to browser:**
```
Connect to my Chrome browser
```

Agent executes:
```json
{"action": "connect", "mode": "user_chrome"}
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
{"action": "snapshot", "format": "ai"}
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

**Problem:** Chrome not running with CDP

**Fix:**
```bash
# Kill existing Chrome
pkill chrome  # Linux/Mac
taskkill /F /IM chrome.exe  # Windows

# Start with CDP
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome-cdp" --profile-directory="Default"
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

### "Port 9222 already in use"

**Fix:** Use a different port:
```bash
google-chrome --remote-debugging-port=9223
```

Then tell the agent:
```
Connect to Chrome on port 9223
```

Or set environment variable:
```bash
export CHROME_CDP_URL="http://127.0.0.1:9223"
```

### Extension Badge Shows "OFF"

**Problem:** Extension not connected to sidecar

**Fix:**
1. Make sure WindieOS Electron app is running
2. Check that sidecar started properly
3. Look for errors in Electron console (Ctrl+Shift+I)

## Advanced Usage

### Using Managed Browser (No Chrome Setup)

```
Launch a new browser and go to example.com
```

Agent uses:
```json
{"action": "connect", "mode": "managed", "headless": false}
```

This launches an isolated Chromium instance without affecting your main Chrome.

### Headless Mode

```
Open a headless browser and check the price of Bitcoin
```

Agent uses:
```json
{"action": "connect", "mode": "managed", "headless": true}
```

No visible window, but screenshots still work.

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
# Chrome CDP URL (default: http://127.0.0.1:9222)
export CHROME_CDP_URL="http://127.0.0.1:9222"

# Use mock LLM for testing
export WINDIEOS_LLM_CLIENT="mock_browser"

# Playwright browser path (optional)
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"
```

## Next Steps

- Read the full [Browser Control Documentation](BROWSER_CONTROL.md)
- Check [Architecture Decision Record](adr/004-browser-extension-auto-attach.md) for future extension mode
- See [Tool Development Guide](TOOL_DEVELOPMENT.md) to extend browser capabilities
