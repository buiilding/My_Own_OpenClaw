"""
Mock LLM Client for Browser Control Simulation.

Demonstrates the browser tool by navigating to Amazon,
searching for shoes, and clicking on the cheapest option.

Uses Browser Use-backed browser actions instead of computer-use tools.
"""

from typing import Any

from backend.src.core.config.models import AppConfig
from backend.src.core.types.schemas import NormalizedLLMResponse, NormalizedToolCall
from backend.src.llm.client import LLMClient
from backend.src.simulation.base_mock_llm_client import BaseSimulationLLMClient


def _browser_tool_call(
    iteration: int,
    index: int,
    arguments: dict[str, Any],
) -> NormalizedToolCall:
    return {
        "id": f"browser_simulation_call_{iteration}_{index}",
        "name": "browser",
        "arguments": dict(arguments),
    }


def _browser_tool_turn(
    iteration: int,
    arguments: dict[str, Any],
    *,
    explanation: str,
    content: str = "",
) -> NormalizedLLMResponse:
    return {
        "content": content,
        "finish_reason": "tool_calls",
        "tool_calls": [
            _browser_tool_call(
                iteration,
                1,
                {"explanation": explanation, **arguments},
            )
        ],
    }


# ============================================================================
# BROWSER CONTROL SIMULATION SEQUENCE
# ============================================================================
# Demonstrates using browser tool to automate Amazon shopping.

BROWSER_SIMULATION_RESPONSES: list[NormalizedLLMResponse] = [
    _browser_tool_turn(
        0,
        {"action": "connect"},
        explanation="Connect to the dedicated browser session.",
    ),
    _browser_tool_turn(
        1,
        {"action": "navigate", "url": "https://amazon.com"},
        explanation="Navigating to Amazon.com to search for shoes.",
    ),
    _browser_tool_turn(
        2,
        {"action": "snapshot", "limit": 3000},
        explanation="Getting page snapshot to identify the search box element.",
    ),
    _browser_tool_turn(
        3,
        {"action": "input", "index": 11, "text": "shoes"},
        explanation="Typing 'shoes' into the Amazon search box.",
    ),
    _browser_tool_turn(
        4,
        {"action": "send_keys", "keys": "Enter"},
        explanation="Pressing Enter to submit the search.",
    ),
    _browser_tool_turn(
        5,
        {"action": "wait", "seconds": 2},
        explanation="Waiting for the Amazon search results page to fully load.",
    ),
    _browser_tool_turn(
        6,
        {"action": "snapshot", "limit": 5000},
        explanation="Getting snapshot to see product listings and find sorting options.",
    ),
    _browser_tool_turn(
        7,
        {
            "action": "evaluate",
            "code": "(() => { const select = document.querySelector('#s-result-sort-select'); if (!select) return { ok: false, reason: 'select not found' }; const option = Array.from(select.options).find(o => (o.textContent || '').includes('Price: Low to High')); if (!option) return { ok: false, reason: 'option not found' }; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, value: option.value, label: option.textContent }; })()",
        },
        explanation="Updating the Sort by dropdown to 'Price: Low to High' via DOM.",
    ),
    _browser_tool_turn(
        8,
        {"action": "wait", "seconds": 0.5},
        explanation="Waiting a short moment to allow the page to refresh sorted results.",
    ),
    _browser_tool_turn(
        9,
        {"action": "wait", "seconds": 2},
        explanation="Waiting for the results page to reload with sorted listings.",
    ),
    _browser_tool_turn(
        10,
        {"action": "wait", "seconds": 2},
        explanation="Waiting for the page to reload with sorted results.",
    ),
    _browser_tool_turn(
        11,
        {"action": "snapshot", "limit": 4000},
        explanation="Getting snapshot to identify the cheapest shoe listing.",
    ),
    _browser_tool_turn(
        12,
        {
            "action": "evaluate",
            "code": "(() => { const selector = 'a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal'; const link = document.querySelector(selector); if (!link) return { ok: false, reason: 'no product link found' }; link.click(); return { ok: true, href: link.href, text: (link.textContent || '').trim() }; })()",
        },
        explanation="Clicking on the cheapest shoe product to view its details.",
    ),
    _browser_tool_turn(
        13,
        {"action": "wait", "seconds": 2},
        explanation="Waiting for product detail page to load completely.",
    ),
    _browser_tool_turn(
        14,
        {"action": "screenshot"},
        explanation="Taking a screenshot to capture the cheapest shoe details.",
    ),
    _browser_tool_turn(
        15,
        {"action": "close"},
        explanation="Closing the browser session after completing the shopping simulation.",
        content="I've successfully navigated to Amazon, searched for shoes, sorted them by price from lowest to highest, and clicked on the cheapest shoe option. I took a screenshot of the product page showing the details. The task is complete!",
    ),
]


class MockLLMBrowserClient(BaseSimulationLLMClient):
    """
    Mock LLM Client that demonstrates browser tool.

    Simulates an agent that:
    1. Connects to the dedicated browser session
    2. Navigates to Amazon
    3. Searches for "shoes"
    4. Sorts by price (low to high)
    5. Clicks on the cheapest shoe
    6. Takes a screenshot
    7. Closes browser connection

    Uses canonical browser tool actions with Browser Use element indexes.
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
