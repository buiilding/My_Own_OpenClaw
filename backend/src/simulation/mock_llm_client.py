"""
Mock LLM Client for Simulation.

Intercepts LLM calls and returns hardcoded responses based on simulation steps.
This allows the simulation to run the exact same backend flow without actual LLM calls.
"""
import json
import logging
import platform
from typing import AsyncGenerator, List

from backend.src.core.config import AppConfig
from backend.src.core.events import ChunkEvent, StreamingEvent
from backend.src.llm.client import LLMClient
from backend.src.core.types import LLMMessage

logger = logging.getLogger(__name__)


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
# Each step represents what the LLM should "return" for that iteration
# The format matches what ResponseParser expects: {"functionCall": {"name": "...", "args": {...}}}

# Build simulation responses with platform-aware commands
_chrome_command = get_chrome_command()

SIMULATION_RESPONSES = [
    # Iteration 1: Open Chrome and wait
    {
        "response": json.dumps({
            "functionCall": {
                "name": "run_shell_command",
                "args": {
                    "command": _chrome_command,
                    "run_in_background": True,
                    "explanation": "Opening Google Chrome browser in the background to start the navigation flow."
                }
            }
        })
    },
    # Iteration 2: Wait for Chrome to load
    {
        "response": json.dumps({
            "functionCall": {
                "name": "wait",
                "args": {
                    "seconds": 2.0,
                    "explanation": "Waiting for Chrome to start loading before taking a screenshot.",
                    "expectation": "Chrome should be starting up and loading its initial page."
                }
            }
        })
    },
    # Iteration 4: Click "Search Google or type a URL" (using OCR)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "mouse_control",
                "args": {
                    "action": "click",
                    "find_coordinates_by": "ocr",
                    "ocr_text": "Search Google or type a URL",
                    "explanation": "Clicking on the text 'Search Google or type a URL' found via OCR.",
                    "expectation": "The UI should respond to clicking on 'Search Google or type a URL'.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 5: Bundle - Type "amazon.com" and press Enter
    # Return multiple tool calls as separate JSON objects (parser will extract both)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "keyboard_control",
                "args": {
                    "action": "type",
                    "text": "amazon.com",
                    "explanation": "Typing 'amazon.com' into the browser address bar.",
                    "expectation": "The text 'amazon.com' should appear in the address bar.",
                    "wait": 2.0
                }
            }
        }) + "\n" + json.dumps({
            "functionCall": {
                "name": "keyboard_control",
                "args": {
                    "action": "press",
                    "key": "enter",
                    "explanation": "Pressing Enter to navigate to amazon.com.",
                    "expectation": "The browser should navigate to the Amazon website.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 6: Click "Search Amazon" (using OCR)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "mouse_control",
                "args": {
                    "action": "click",
                    "find_coordinates_by": "ocr",
                    "ocr_text": "Search Amazon",
                    "explanation": "Clicking on the text 'Search Amazon' found via OCR.",
                    "expectation": "The UI should respond to clicking on 'Search Amazon'.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 7: Bundle - Type "amazon.com" and press Enter
    # Return multiple tool calls as separate JSON objects (parser will extract both)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "keyboard_control",
                "args": {
                    "action": "type",
                    "text": "shoes",
                    "explanation": "Typing 'shoes' into the Amazon search box.",
                    "expectation": "The text 'shoes' should appear in the search box.",
                    "wait": 2.0
                }
            }
        }) + "\n" + json.dumps({
            "functionCall": {
                "name": "keyboard_control",
                "args": {
                    "action": "press",
                    "key": "enter",
                    "explanation": "Pressing Enter to search for shoes on Amazon.",
                    "expectation": "Amazon should display search results for shoes.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 8: Click "Sort by: Featured" (using OCR)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "mouse_control",
                "args": {
                    "action": "click",
                    "find_coordinates_by": "ocr",
                    "ocr_text": "Sort by: Featured",
                    "explanation": "Clicking on the text 'Sort by: Featured' found via OCR.",
                    "expectation": "The UI should respond to clicking on 'Sort by: Featured'.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 9: Click "Price: Low to High" (using OCR)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "mouse_control",
                "args": {
                    "action": "click",
                    "find_coordinates_by": "ocr",
                    "ocr_text": "Price: Low to High",
                    "explanation": "Clicking on the text 'Price: Low to High' found via OCR.",
                    "expectation": "The UI should respond to clicking on 'Price: Low to High'.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 10: Scroll down
    {
        "response": json.dumps({
            "functionCall": {
                "name": "scroll_control",
                "args": {
                    "action": "scroll_down",
                    "clicks": 50,
                    "explanation": "Scrolling down the page to see more search results.",
                    "expectation": "The page should scroll down, revealing more product listings.",
                    "wait": 2.0
                }
            }
        })
    },
    # Iteration 11: Click "Black Water Shoes Snorkeling Swim Shoes Quick Dry" using Vision model
    {
        "response": json.dumps({
            "functionCall": {
                "name": "mouse_control",
                "args": {
                    "action": "click",
                    "find_coordinates_by": "prediction",
                    "description": "Black Water Shoes Snorkeling Swim Shoes Quick Dry",
                    "explanation": "Clicking on 'Black Water Shoes Snorkeling Swim Shoes Quick Dry' found via vision model.",
                    "expectation": "The UI should respond to clicking on 'Black Water Shoes Snorkeling Swim Shoes Quick Dry'.",
                    "wait": 2.0
                }
            }
        })
    },
    # Final iteration: No more tools, return final response
    {
        "response": "I've successfully navigated to Amazon, searched for shoes, sorted them by price, and clicked on Black Water Shoes Snorkeling Swim Shoes Quick Dry. The task is complete."
    },
]


class MockLLMClient(LLMClient):
    """
    Mock LLM Client that returns hardcoded responses based on simulation steps.
    
    Tracks the current iteration and returns the appropriate hardcoded response
    from SIMULATION_RESPONSES. This allows the simulation to run the exact same
    backend flow without making actual LLM API calls.
    """
    
    def __init__(self, cfg: AppConfig):
        """
        Initialize the mock LLM client.
        
        Args:
            cfg: Application configuration (required by interface, but not used)
        """
        self.config = cfg
        self._iteration = 0
        self._max_iterations = len(SIMULATION_RESPONSES)
        logger.info(f"MockLLMClient initialized with {self._max_iterations} hardcoded responses")
    
    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """
        Get a non-streaming completion (not used in normal flow, but required by interface).
        
        Args:
            model: Model identifier (ignored)
            messages: Conversation messages (ignored)
            
        Returns:
            Hardcoded response for current iteration
        """
        if self._iteration >= self._max_iterations:
            logger.warning("MockLLMClient: Exceeded max iterations, returning final message")
            return SIMULATION_RESPONSES[-1]["response"]
        
        response = SIMULATION_RESPONSES[self._iteration]["response"]
        self._iteration += 1
        logger.info(f"MockLLMClient.get_completion: Returning response for iteration {self._iteration - 1}")
        return response
    
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Get a streaming completion (used by InteractionLoop).
        
        Args:
            model: Model identifier (ignored)
            messages: Conversation messages (ignored)
            
        Yields:
            StreamingEvent objects (ChunkEvent, then FullResponseEvent)
        """
        if self._iteration >= self._max_iterations:
            logger.warning("MockLLMClient: Exceeded max iterations, returning final message")
            final_response = SIMULATION_RESPONSES[-1]["response"]
            # Stream it character by character to simulate real streaming
            for char in final_response:
                yield ChunkEvent(content=char)
            # Don't yield FullResponseEvent here - LLMInteractionHandler will yield it
            return
        
        response = SIMULATION_RESPONSES[self._iteration]["response"]
        iteration_num = self._iteration
        self._iteration += 1
        
        logger.info(f"MockLLMClient.get_completion_stream: Returning response for iteration {iteration_num}")
        logger.debug(f"MockLLMClient: Response content: {response[:200]}...")
        
        # Stream the response character by character to simulate real LLM streaming
        # This ensures the backend processes it exactly like a real LLM response
        for char in response:
            yield ChunkEvent(content=char)
        
        # Don't yield FullResponseEvent here - LLMInteractionHandler will yield it
        # after aggregating all chunks. This prevents duplication.
    
    def reset(self):
        """Reset iteration counter (useful for testing or restarting simulation)."""
        self._iteration = 0
        logger.info("MockLLMClient: Reset iteration counter")


def get_mock_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get a MockLLMClient instance.
    
    Args:
        cfg: Application configuration
        
    Returns:
        MockLLMClient instance
    """
    return MockLLMClient(cfg)
