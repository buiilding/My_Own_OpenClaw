"""
Mock LLM Client for Browser Control Simulation.

Demonstrates the browser tool by navigating to Amazon,
searching for shoes, and clicking on the cheapest option.

Uses browser tool instead of computer-use tools for more
reliable automation via Playwright.
"""

from typing import Any

from backend.src.core.config import AppConfig
from backend.src.core.types.schemas import NormalizedLLMResponse, NormalizedToolCall
from backend.src.llm.client import LLMClient
from backend.src.simulation.base_mock_llm_client import BaseSimulationLLMClient


def _browser_tool_call(
    iteration: int,
    index: int,
    arguments: dict[str, Any],
    metadata: dict[str, str] | None = None,
) -> NormalizedToolCall:
    normalized_arguments = dict(arguments)
    if metadata:
        normalized_arguments["metadata"] = dict(metadata)
    return {
        "id": f"browser_simulation_call_{iteration}_{index}",
        "name": "browser",
        "arguments": normalized_arguments,
    }


def _browser_tool_turn(
    iteration: int,
    arguments: dict[str, Any],
    metadata: dict[str, str] | None = None,
    *,
    content: str = "",
) -> NormalizedLLMResponse:
    return {
        "content": content,
        "finish_reason": "tool_calls",
        "tool_calls": [_browser_tool_call(iteration, 1, arguments, metadata)],
    }


# ============================================================================
# BROWSER CONTROL SIMULATION SEQUENCE
# ============================================================================
# Demonstrates using browser tool to automate Amazon shopping.

BROWSER_SIMULATION_RESPONSES: list[NormalizedLLMResponse] = [
    _browser_tool_turn(
        0,
        {
            "action": "connect",
            "mode": "user_chrome",
            "cdp_url": "http://127.0.0.1:9222",
        },
    ),
    _browser_tool_turn(
        1,
        {"action": "navigate", "url": "https://amazon.com"},
        {
            "description": "Connected to Chrome browser successfully.",
            "explanation": "Navigating to Amazon.com to search for shoes.",
            "expectation": "Amazon homepage should load.",
        },
    ),
    _browser_tool_turn(
        2,
        {"action": "snapshot", "format": "ai", "max_chars": 3000},
        {
            "description": "Amazon homepage has loaded with search functionality visible.",
            "explanation": "Getting page snapshot to identify the search box element.",
            "expectation": "Should receive a snapshot with numbered element refs including the search box.",
        },
    ),
    _browser_tool_turn(
        3,
        {"action": "input", "ref": "11", "text": "shoes"},
        {
            "description": "Page snapshot shows [11] searchbox 'Search Amazon'.",
            "explanation": "Typing 'shoes' into the Amazon search box.",
            "expectation": "The search query should be entered into the search box.",
        },
    ),
    _browser_tool_turn(
        4,
        {"action": "send_keys", "keys": "Enter"},
        {
            "description": "Search query is entered in the Amazon search box.",
            "explanation": "Pressing Enter to submit the search.",
            "expectation": "The browser should start loading search results.",
        },
    ),
    _browser_tool_turn(
        5,
        {"action": "wait", "seconds": 2},
        {
            "description": "Search submitted, waiting for results page to load.",
            "explanation": "Waiting for the Amazon search results page to fully load.",
            "expectation": "Search results page should load with shoe listings.",
        },
    ),
    _browser_tool_turn(
        6,
        {"action": "snapshot", "format": "ai", "max_chars": 5000},
        {
            "description": "Amazon search results page for shoes has loaded.",
            "explanation": "Getting snapshot to see product listings and find sorting options.",
            "expectation": "Should see product listings with prices and sort options.",
        },
    ),
    _browser_tool_turn(
        7,
        {
            "action": "evaluate",
            "script": "(() => { const select = document.querySelector('#s-result-sort-select'); if (!select) return { ok: false, reason: 'select not found' }; const option = Array.from(select.options).find(o => (o.textContent || '').includes('Price: Low to High')); if (!option) return { ok: false, reason: 'option not found' }; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, value: option.value, label: option.textContent }; })()",
        },
        {
            "description": "Search results page is loaded with sorting controls available.",
            "explanation": "Updating the Sort by dropdown to 'Price: Low to High' via DOM.",
            "expectation": "Page should reload with results sorted from lowest to highest price.",
        },
    ),
    _browser_tool_turn(
        8,
        {"action": "wait", "seconds": 0.5},
        {
            "description": "Sort change triggered, waiting briefly for results to update.",
            "explanation": "Waiting a short moment to allow the page to refresh sorted results.",
            "expectation": "Results should begin updating to the new sort order.",
        },
    ),
    _browser_tool_turn(
        9,
        {"action": "wait", "seconds": 2},
        {
            "description": "Sorting updated to Price: Low to High.",
            "explanation": "Waiting for the results page to reload with sorted listings.",
            "expectation": "Results should reload showing cheapest shoes first.",
        },
    ),
    _browser_tool_turn(
        10,
        {"action": "wait", "seconds": 2},
        {
            "description": "Sorting changed to Price: Low to High, page reloading.",
            "explanation": "Waiting for the page to reload with sorted results.",
            "expectation": "Results should reload showing cheapest shoes first.",
        },
    ),
    _browser_tool_turn(
        11,
        {"action": "snapshot", "format": "ai", "max_chars": 4000},
        {
            "description": "Search results now sorted by price (low to high).",
            "explanation": "Getting snapshot to identify the cheapest shoe listing.",
            "expectation": "Should see cheapest shoe as the first product listing.",
        },
    ),
    _browser_tool_turn(
        12,
        {
            "action": "evaluate",
            "script": "(() => { const selector = 'a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal'; const link = document.querySelector(selector); if (!link) return { ok: false, reason: 'no product link found' }; link.click(); return { ok: true, href: link.href, text: (link.textContent || '').trim() }; })()",
        },
        {
            "description": "Snapshot shows first product is the cheapest shoe with title and price visible.",
            "explanation": "Clicking on the cheapest shoe product to view its details.",
            "expectation": "Product detail page for the cheapest shoe should load.",
        },
    ),
    _browser_tool_turn(
        13,
        {"action": "wait", "seconds": 2},
        {
            "description": "Clicked on cheapest shoe, navigating to product page.",
            "explanation": "Waiting for product detail page to load completely.",
            "expectation": "Product page should load showing shoe details, price, and Add to Cart button.",
        },
    ),
    _browser_tool_turn(
        14,
        {"action": "screenshot"},
        {
            "description": "Product page for cheapest shoe has loaded.",
            "explanation": "Taking a screenshot to capture the cheapest shoe details.",
            "expectation": "Screenshot should show the product with price and details.",
        },
    ),
    _browser_tool_turn(
        15,
        {"action": "close"},
        content="I've successfully navigated to Amazon, searched for shoes, sorted them by price from lowest to highest, and clicked on the cheapest shoe option. I took a screenshot of the product page showing the details. The task is complete!",
    ),
]


class MockLLMBrowserClient(BaseSimulationLLMClient):
    """
    Mock LLM Client that demonstrates browser tool.

    Simulates an agent that:
    1. Connects to user's Chrome browser
    2. Navigates to Amazon
    3. Searches for "shoes"
    4. Sorts by price (low to high)
    5. Clicks on the cheapest shoe
    6. Takes a screenshot
    7. Closes browser connection

    Uses browser tool with element refs instead of OCR/vision
    for more reliable automation.
    """

    def __init__(self, cfg: AppConfig):
        """
        Initialize the mock browser LLM client.

        Args:
            cfg: Application configuration (required by interface, but not used)
        """
        super().__init__(
            cfg,
            BROWSER_SIMULATION_RESPONSES,
            logger_name="MockLLMBrowserClient",
        )


def get_mock_llm_browser_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get a MockLLMBrowserClient instance.

    Args:
        cfg: Application configuration

    Returns:
        MockLLMBrowserClient instance
    """
    return MockLLMBrowserClient(cfg)
