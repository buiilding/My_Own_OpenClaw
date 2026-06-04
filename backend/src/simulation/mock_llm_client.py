"""
Mock LLM Client for Simulation.

Intercepts LLM calls and returns hardcoded responses based on simulation steps.
This allows the simulation to run the exact same backend flow without actual LLM calls.
"""

import platform
from typing import Any

from backend.src.core.config import AppConfig
from backend.src.core.types.schemas import NormalizedLLMResponse, NormalizedToolCall
from backend.src.llm.client import LLMClient
from backend.src.simulation.base_mock_llm_client import BaseSimulationLLMClient


def get_chrome_command() -> str:
    """
    Get the platform-specific command to open Google Chrome.

    Returns:
        Command string appropriate for the current platform
    """
    system = platform.system()

    if system == "Windows":
        # Windows: use 'start chrome' which is more reliable than 'google-chrome'
        return "start chrome"
    elif system == "Darwin":
        # macOS: use open command
        return 'open -a "Google Chrome"'
    else:
        # Linux/Unix: use google-chrome or chromium
        return "google-chrome"


# ============================================================================
# SIMULATION SEQUENCE CONFIGURATION
# ============================================================================
# Each step is already in the normalized provider response shape consumed by
# the interaction loop.


def _tool_call(
    iteration: int,
    index: int,
    name: str,
    arguments: dict[str, Any],
    metadata: dict[str, str] | None = None,
) -> NormalizedToolCall:
    normalized_arguments = dict(arguments)
    if metadata:
        normalized_arguments["metadata"] = dict(metadata)
    return {
        "id": f"simulation_call_{iteration}_{index}",
        "name": name,
        "arguments": normalized_arguments,
    }


def _tool_turn(
    iteration: int,
    name: str,
    arguments: dict[str, Any],
    metadata: dict[str, str] | None = None,
) -> NormalizedLLMResponse:
    return {
        "content": "",
        "finish_reason": "tool_calls",
        "tool_calls": [_tool_call(iteration, 1, name, arguments, metadata)],
    }


def _multi_tool_turn(
    iteration: int,
    calls: list[tuple[str, dict[str, Any], dict[str, str] | None]],
) -> NormalizedLLMResponse:
    return {
        "content": "",
        "finish_reason": "tool_calls",
        "tool_calls": [
            _tool_call(iteration, index, name, arguments, metadata)
            for index, (name, arguments, metadata) in enumerate(calls, start=1)
        ],
    }


def _text_turn(content: str) -> NormalizedLLMResponse:
    return {"content": content, "finish_reason": "stop"}


# Build simulation responses with platform-aware commands
_chrome_command = get_chrome_command()

SIMULATION_RESPONSES: list[NormalizedLLMResponse] = [
    # Iteration 1: Open Chrome
    _tool_turn(
        0,
        "run_shell_command",
        {"command": _chrome_command, "run_in_background": True, "wait": 2.0},
    ),
    # Iteration 2: Click "Search Google or type a URL" (using OCR)
    _tool_turn(
        1,
        "mouse_control",
        {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Search Google or type a URL",
            "wait": 0,
        },
        {
            "description": "Chrome browser window is open with the address bar visible.",
            "explanation": "Clicking on the text 'Search Google or type a URL' found via OCR.",
            "expectation": "The UI should respond to clicking on 'Search Google or type a URL'.",
        },
    ),
    # Iteration 3: Bundle - Type "amazon.com" and press Enter
    _multi_tool_turn(
        2,
        [
            (
                "keyboard_control",
                {"action": "type", "text": "amazon.com", "wait": 0},
                {
                    "description": "Address bar is focused and ready for input.",
                    "explanation": "Typing 'amazon.com' into the browser address bar.",
                    "expectation": "The text 'amazon.com' should appear in the address bar.",
                },
            ),
            (
                "keyboard_control",
                {"action": "press", "key": "enter", "wait": 2.0},
                {
                    "description": "Address bar shows 'amazon.com' text.",
                    "explanation": "Pressing Enter to navigate to amazon.com.",
                    "expectation": "The browser should navigate to the Amazon website.",
                },
            ),
        ],
    ),
    # Iteration 4: Click "Search Amazon" (using OCR)
    _tool_turn(
        3,
        "mouse_control",
        {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Search Amazon",
            "wait": 0.2,
        },
        {
            "description": "Amazon homepage is loaded with search box visible.",
            "explanation": "Clicking on the text 'Search Amazon' found via OCR.",
            "expectation": "The UI should respond to clicking on 'Search Amazon'.",
        },
    ),
    # Iteration 5: Bundle - Type "shoes" and press Enter
    _multi_tool_turn(
        4,
        [
            (
                "keyboard_control",
                {"action": "type", "text": "shoes", "wait": 0.0},
                {
                    "description": "Amazon search box is focused and ready for input.",
                    "explanation": "Typing 'shoes' into the Amazon search box.",
                    "expectation": "The text 'shoes' should appear in the search box.",
                },
            ),
            (
                "keyboard_control",
                {"action": "press", "key": "enter", "wait": 2.0},
                {
                    "description": "Search box shows 'shoes' text.",
                    "explanation": "Pressing Enter to search for shoes on Amazon.",
                    "expectation": "Amazon should display search results for shoes.",
                },
            ),
        ],
    ),
    # Iteration 6: Click "Sort by: Featured" (using OCR)
    _tool_turn(
        5,
        "mouse_control",
        {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Sort by: Featured",
            "wait": 0.2,
        },
        {
            "description": "Amazon search results page showing shoes with sort options visible.",
            "explanation": "Clicking on the text 'Sort by: Featured' found via OCR.",
            "expectation": "The UI should respond to clicking on 'Sort by: Featured'.",
        },
    ),
    # Iteration 7: Click "Price: Low to High" (using OCR)
    _tool_turn(
        6,
        "mouse_control",
        {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Price: Low to High",
            "wait": 2.0,
        },
        {
            "description": "Sort dropdown menu is open showing sorting options.",
            "explanation": "Clicking on the text 'Price: Low to High' found via OCR.",
            "expectation": "The UI should respond to clicking on 'Price: Low to High'.",
        },
    ),
    # Iteration 8: Scroll down
    _tool_turn(
        7,
        "scroll_control",
        {"action": "scroll_down", "x": 960, "y": 540, "wait": 1.0},
        {
            "description": "Amazon search results page sorted by price, showing product listings.",
            "explanation": "Scrolling down the page to see more search results.",
            "expectation": "The page should scroll down, revealing more product listings.",
        },
    ),
    # Iteration 9: Click "Black Water Shoes Snorkeling Swim Shoes Quick Dry" using Vision model
    _tool_turn(
        8,
        "mouse_control",
        {
            "action": "click",
            "find_coordinates_by": "prediction",
            "source_description": "The cheapest pair of shoes on the list",
            "wait": 2.0,
        },
        {
            "description": "Scrolled search results page showing multiple shoe products sorted by price.",
            "explanation": "Clicking on the cheapest pair of shoes on the list found via vision model.",
            "expectation": "The UI should respond to clicking on the cheapest pair of shoes on the list.",
        },
    ),
    # Final iteration: No more tools, return final response
    _text_turn(
        "I've successfully navigated to Amazon, searched for shoes, sorted them by price, and clicked on Black Water Shoes Snorkeling Swim Shoes Quick Dry. The task is complete."
    ),
]


class MockLLMClient(BaseSimulationLLMClient):
    """
    Mock LLM Client that returns hardcoded responses based on simulation steps.

    Tracks the current iteration and returns the appropriate hardcoded response
    from SIMULATION_RESPONSES. This allows the simulation to run the exact same
    backend flow without making actual LLM API calls.
    """

    def __init__(self, cfg: AppConfig):
        """Initialize the mock LLM client."""
        super().__init__(
            cfg,
            SIMULATION_RESPONSES,
            logger_name="MockLLMClient",
        )


def get_mock_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get a MockLLMClient instance.

    Args:
        cfg: Application configuration

    Returns:
        MockLLMClient instance
    """
    return MockLLMClient(cfg)
