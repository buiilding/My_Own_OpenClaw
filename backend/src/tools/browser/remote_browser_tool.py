"""
Remote browser control tool for backend.

This is a stub tool that defines the schema for browser control.
Actual execution happens in the frontend sidecar.
"""

from backend.src.tools.remote import RemoteToolBase
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.browser.schemas import BrowserControlArgs


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    """
    Remote browser control tool.
    
    Controls a web browser for online tasks. Supports two modes:
    
    **User Chrome Mode (user_chrome):**
    - Connects to user's existing Chrome browser
    - Requires Chrome to be started with --remote-debugging-port=9222
    - Shares user's cookies, logins, and extensions
    - Full access to all tabs
    
    **Managed Mode (managed):**
    - Launches isolated Chromium instance
    - Clean profile, no cookies or logins
    - Safe for automation without affecting user's browser
    - Headless option available
    
    **Actions:**
    - `connect`: Initialize browser connection
    - `navigate`: Go to URL
    - `snapshot`: Get page overview with element refs (e.g., [1] button "Submit")
    - `click`: Click element by ref
    - `type`: Type text into input
    - `press`: Press keyboard key (Enter, Escape, etc.)
    - `scroll`: Scroll page
    - `screenshot`: Capture screenshot
    - `wait`: Wait for load state or time
    - `get_tabs`: List open tabs
    - `switch_tab`: Switch to specific tab
    - `evaluate`: Execute JavaScript
    - `close`: Close browser connection
    
    **Usage Workflow:**
    1. Start with `action="connect"` and `mode="user_chrome"` or `mode="managed"`
    2. Use `action="navigate"` to go to a URL
    3. Use `action="snapshot"` to see the page with numbered element refs
    4. Interact using refs: `action="click" ref="5"` or `action="type" ref="3" text="Hello"`
    5. End with `action="close"` to cleanup
    
    **Example:**
    ```
    # Connect to user's Chrome
    browser_control(action="connect", mode="user_chrome")
    
    # Navigate to a website
    browser_control(action="navigate", url="https://example.com")
    
    # Get page snapshot
    browser_control(action="snapshot")
    # Returns: [1] button "Sign In", [2] input "Username"...
    
    # Click element
    browser_control(action="click", ref="1")
    
    # Type text
    browser_control(action="type", ref="2", text="myusername")
    
    # Close when done
    browser_control(action="close")
    ```
    """
    
    name = "browser_control"
    description = """Control a web browser for online tasks.

Two modes available:
- 'user_chrome': Connect to your existing Chrome (must start with --remote-debugging-port=9222)
- 'managed': Launch isolated Chromium instance (clean profile, no logins)

Workflow:
1. Connect: browser_control(action="connect", mode="user_chrome")
2. Navigate: browser_control(action="navigate", url="https://example.com")
3. Snapshot: browser_control(action="snapshot") - shows page with numbered refs like [1] button
4. Interact: browser_control(action="click", ref="1") or browser_control(action="type", ref="2", text="hello")
5. Close: browser_control(action="close")

Actions:
- connect: Initialize browser (requires mode)
- navigate: Go to URL (requires url)
- snapshot: Get page overview with element refs
- click: Click element (requires ref from snapshot)
- type: Type text (requires ref, text)
- press: Press key like Enter/Escape (requires key)
- scroll: Scroll page (direction: up/down/left/right)
- screenshot: Capture screenshot (optional full_page)
- wait: Wait for load or time
- get_tabs: List open tabs
- switch_tab: Switch to tab (requires target_id)
- evaluate: Run JavaScript (requires script)
- close: Close browser connection"""
    
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER
    
    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        """Prepare browser control for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote browser tool call: {args.action}"
        )
