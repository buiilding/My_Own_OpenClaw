"""
Mock LLM Client for Browser Control Simulation.

Demonstrates the browser_control tool by navigating to Amazon,
searching for shoes, and clicking on the cheapest option.

Uses browser_control tool instead of computer-use tools for more
reliable automation via Playwright.
"""
import json
import logging
from typing import AsyncGenerator, List

from backend.src.core.config import AppConfig
from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.llm.client import LLMClient
from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)


# ============================================================================
# BROWSER CONTROL SIMULATION SEQUENCE
# ============================================================================
# Demonstrates using browser_control tool to automate Amazon shopping

BROWSER_SIMULATION_RESPONSES = [
    # Iteration 1: Connect to browser (user's Chrome)
    {
        "response": json.dumps({
            "functionCall": {
                "name": "browser_control",
                "args": {
                    "action": "connect",
                    "mode": "user_chrome",
                    "cdp_url": "http://127.0.0.1:9222"
                }
            }
        })
    },
    # Iteration 2: Navigate to Amazon
    {
        "response": json.dumps({
            "metadata": {
                "description": "Connected to Chrome browser successfully.",
                "explanation": "Navigating to Amazon.com to search for shoes.",
                "expectation": "Amazon homepage should load."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "navigate",
                        "url": "https://amazon.com",
                        "wait_until": "domcontentloaded"
                    }
                }
            }
        })
    },
    # Iteration 3: Get page snapshot to find search box
    {
        "response": json.dumps({
            "metadata": {
                "description": "Amazon homepage has loaded with search functionality visible.",
                "explanation": "Getting page snapshot to identify the search box element.",
                "expectation": "Should receive a snapshot with numbered element refs including the search box."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "snapshot",
                        "format": "ai",
                        "max_chars": 3000
                    }
                }
            }
        })
    },
    # Iteration 4: Type "shoes" in search box and submit
    # (Assuming ref "11" is the search box from snapshot)
    {
        "response": json.dumps({
            "metadata": {
                "description": "Page snapshot shows [11] searchbox 'Search Amazon'.",
                "explanation": "Typing 'shoes' into the Amazon search box and submitting the search.",
                "expectation": "Search results for shoes should load, sorted by relevance."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "type",
                        "ref": "11",
                        "text": "shoes",
                        "submit": True
                    }
                }
            }
        })
    },
    # Iteration 5: Wait for search results to load
    {
        "response": json.dumps({
            "metadata": {
                "description": "Search submitted, waiting for results page to load.",
                "explanation": "Waiting for the Amazon search results page to fully load.",
                "expectation": "Search results page should load with shoe listings."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "wait",
                        "state": "domcontentloaded"
                    }
                }
            }
        })
    },
    # Iteration 6: Get snapshot of search results
    {
        "response": json.dumps({
            "metadata": {
                "description": "Amazon search results page for shoes has loaded.",
                "explanation": "Getting snapshot to see product listings and find sorting options.",
                "expectation": "Should see product listings with prices and sort options."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "snapshot",
                        "format": "ai",
                        "max_chars": 5000
                    }
                }
            }
        })
    },
    # Iteration 7: Set sort order to Price: Low to High
    {
        "response": json.dumps({
            "metadata": {
                "description": "Search results page is loaded with sorting controls available.",
                "explanation": "Updating the Sort by dropdown to 'Price: Low to High' via DOM.",
                "expectation": "Page should reload with results sorted from lowest to highest price."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "evaluate",
                        "script": "(() => { const select = document.querySelector('#s-result-sort-select'); if (!select) return { ok: false, reason: 'select not found' }; const option = Array.from(select.options).find(o => (o.textContent || '').includes('Price: Low to High')); if (!option) return { ok: false, reason: 'option not found' }; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, value: option.value, label: option.textContent }; })()"
                    }
                }
            }
        })
    },
    # Iteration 8: Wait briefly for page to update after sort
    {
        "response": json.dumps({
            "metadata": {
                "description": "Sort change triggered, waiting briefly for results to update.",
                "explanation": "Waiting a short moment to allow the page to refresh sorted results.",
                "expectation": "Results should begin updating to the new sort order."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "wait",
                        "seconds": 0.5
                    }
                }
            }
        })
    },
    # Iteration 9: Wait for sorted results to load
    {
        "response": json.dumps({
            "metadata": {
                "description": "Sorting updated to Price: Low to High.",
                "explanation": "Waiting for the results page to reload with sorted listings.",
                "expectation": "Results should reload showing cheapest shoes first."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "wait",
                        "state": "domcontentloaded"
                    }
                }
            }
        })
    },
    # Iteration 10: Wait for sorted results to load
    {
        "response": json.dumps({
            "metadata": {
                "description": "Sorting changed to Price: Low to High, page reloading.",
                "explanation": "Waiting for the page to reload with sorted results.",
                "expectation": "Results should reload showing cheapest shoes first."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "wait",
                        "state": "domcontentloaded"
                    }
                }
            }
        })
    },
    # Iteration 11: Get snapshot to find cheapest shoe
    {
        "response": json.dumps({
            "metadata": {
                "description": "Search results now sorted by price (low to high).",
                "explanation": "Getting snapshot to identify the cheapest shoe listing.",
                "expectation": "Should see cheapest shoe as the first product listing."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "snapshot",
                        "format": "ai",
                        "max_chars": 4000
                    }
                }
            }
        })
    },
    # Iteration 12: Click on the cheapest shoe (first product after sorting)
    {
        "response": json.dumps({
            "metadata": {
                "description": "Snapshot shows first product is the cheapest shoe with title and price visible.",
                "explanation": "Clicking on the cheapest shoe product to view its details.",
                "expectation": "Product detail page for the cheapest shoe should load."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "evaluate",
                        "script": "(() => { const selector = 'a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal'; const link = document.querySelector(selector); if (!link) return { ok: false, reason: 'no product link found' }; link.click(); return { ok: true, href: link.href, text: (link.textContent || '').trim() }; })()"
                    }
                }
            }
        })
    },
    # Iteration 13: Wait for product page to load
    {
        "response": json.dumps({
            "metadata": {
                "description": "Clicked on cheapest shoe, navigating to product page.",
                "explanation": "Waiting for product detail page to load completely.",
                "expectation": "Product page should load showing shoe details, price, and Add to Cart button."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "wait",
                        "state": "domcontentloaded"
                    }
                }
            }
        })
    },
    # Iteration 14: Take screenshot of the cheapest shoe
    {
        "response": json.dumps({
            "metadata": {
                "description": "Product page for cheapest shoe has loaded.",
                "explanation": "Taking a screenshot to capture the cheapest shoe details.",
                "expectation": "Screenshot should show the product with price and details."
            },
            "action": {
                "functionCall": {
                    "name": "browser_control",
                    "args": {
                        "action": "screenshot",
                        "full_page": True
                    }
                }
            }
        })
    },
    # Final iteration: Close browser and return success message
    {
        "response": json.dumps({
            "functionCall": {
                "name": "browser_control",
                "args": {
                    "action": "close"
                }
            }
        }) + "\n" + json.dumps({
            "response": "I've successfully navigated to Amazon, searched for shoes, sorted them by price from lowest to highest, and clicked on the cheapest shoe option. I took a screenshot of the product page showing the details. The task is complete!"
        })
    },
]


class MockLLMBrowserClient(LLMClient):
    """
    Mock LLM Client that demonstrates browser_control tool.
    
    Simulates an agent that:
    1. Connects to user's Chrome browser
    2. Navigates to Amazon
    3. Searches for "shoes"
    4. Sorts by price (low to high)
    5. Clicks on the cheapest shoe
    6. Takes a screenshot
    7. Closes browser connection
    
    Uses browser_control tool with element refs instead of OCR/vision
    for more reliable automation.
    """
    
    def __init__(self, cfg: AppConfig):
        """
        Initialize the mock browser LLM client.
        
        Args:
            cfg: Application configuration (required by interface, but not used)
        """
        self.config = cfg
        self._iteration = 0
        self._max_iterations = len(BROWSER_SIMULATION_RESPONSES)
        logger.info(f"MockLLMBrowserClient initialized with {self._max_iterations} hardcoded responses")
    
    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> str:
        """
        Get a non-streaming completion.
        
        Args:
            model: Model identifier (ignored)
            messages: Conversation messages (ignored)
            
        Returns:
            Hardcoded response for current iteration
        """
        if self._iteration >= self._max_iterations:
            logger.warning("MockLLMBrowserClient: Exceeded max iterations, returning final message")
            return BROWSER_SIMULATION_RESPONSES[-1]["response"]
        
        response = BROWSER_SIMULATION_RESPONSES[self._iteration]["response"]
        self._iteration += 1
        logger.info(f"MockLLMBrowserClient.get_completion: Returning response for iteration {self._iteration - 1}")
        return response
    
    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Get a streaming completion (used by InteractionLoop).
        
        Args:
            model: Model identifier (ignored)
            messages: Conversation messages (ignored)
            
        Yields:
            StreamingEvent objects (ChunkEvent)
        """
        if self._iteration >= self._max_iterations:
            logger.warning("MockLLMBrowserClient: Exceeded max iterations, returning final message")
            final_response = BROWSER_SIMULATION_RESPONSES[-1]["response"]
            for char in final_response:
                yield ChunkEvent(content=char)
            return
        
        response = BROWSER_SIMULATION_RESPONSES[self._iteration]["response"]
        iteration_num = self._iteration
        self._iteration += 1
        
        logger.info(f"MockLLMBrowserClient.get_completion_stream: Returning response for iteration {iteration_num}")
        logger.debug(f"MockLLMBrowserClient: Response content: {response[:200]}...")
        
        # Stream the response character by character
        for char in response:
            yield ChunkEvent(content=char)
    
    def reset(self):
        """Reset iteration counter (useful for testing or restarting simulation)."""
        self._iteration = 0
        logger.info("MockLLMBrowserClient: Reset iteration counter")


def get_mock_llm_browser_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get a MockLLMBrowserClient instance.
    
    Args:
        cfg: Application configuration
        
    Returns:
        MockLLMBrowserClient instance
    """
    return MockLLMBrowserClient(cfg)
