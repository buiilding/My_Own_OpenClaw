"""
Web Tool Template

Template for creating tools that interact with web services, APIs, or perform
HTTP requests. Includes proper async HTTP handling and error management.

Replace:
- ToolName with your tool's name
- API endpoints, authentication, and logic
"""

from typing import Any, Dict, Optional

import aiohttp

from backend.tools.base import Kind, Tool, ToolContext, ToolResult


class ToolName(Tool):
    """
    Web tool for [specific web/API operation].

    This tool communicates with [API/service name] to perform [describe operation].
    Handles authentication, rate limiting, and network errors gracefully.
    """

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(name="tool_name", description="...", kind=Tool.Kind.FETCH)
        self.api_key = api_key
        self.base_url = "https://api.example.com"  # Replace with actual API
        self.timeout = aiohttp.ClientTimeout(total=30)  # 30 second timeout

    @property
    def name(self) -> str:
        return "tool_name"

    @property
    def description(self) -> str:
        return "Description of web/API tool functionality"

    @property
    def kind(self) -> Kind:
        return Kind.FETCH

    async def execute_async(
        self,
        context: ToolContext,
        query: str,  # Main query parameter
        limit: Optional[int] = 10,  # Optional limit parameter
    ) -> ToolResult:
        """
        Execute web/API operation.

        Args:
            context: Tool execution context
            query: Main query or search term
            limit: Optional result limit

        Returns:
            ToolResult with API response data
        """
        try:
            # Prepare request parameters
            params = {"q": query, "limit": limit or 10}

            # Prepare headers
            headers = {
                "User-Agent": "DesktopAssistant/1.0",
                "Accept": "application/json",
            }

            # Add authentication if available
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            # Make HTTP request
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.get(
                    f"{self.base_url}/endpoint",  # Replace with actual endpoint
                    params=params,
                    headers=headers,
                ) as response:
                    # Check for HTTP errors
                    if response.status >= 400:
                        error_text = await response.text()
                        return ToolResult(
                            success=False,
                            error=f"API error {response.status}: {error_text}",
                            llm_content=f"Error: API returned {response.status}",
                            return_display=f"API Error: {response.status}",
                        )

                    # Parse JSON response
                    data = await response.json()

                    # Process response data
                    result_data = self._process_response(data)

                    return ToolResult(
                        success=True,
                        llm_content=f"Successfully retrieved data for: {query}",
                        return_display=result_data,
                        data=result_data,
                    )

        except aiohttp.ClientTimeout:
            return ToolResult(
                success=False,
                error="Request timed out",
                llm_content="Error: Request timed out",
                return_display="Timeout: Request took too long",
            )
        except aiohttp.ClientError as e:
            return ToolResult(
                success=False,
                error=f"Network error: {str(e)}",
                llm_content=f"Error: {str(e)}",
                return_display=f"Network Error: {str(e)}",
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: {str(e)}",
                return_display=f"Unexpected Error: {str(e)}",
            )

    def _process_response(self, data: Dict[str, Any]) -> str:
        """
        Process API response data into human-readable format.

        Args:
            data: Raw API response data

        Returns:
            Processed string representation
        """
        # Implement your response processing logic here
        # Example: Extract relevant fields and format nicely
        if isinstance(data, dict):
            # Process dictionary response
            return f"Found {len(data.get('results', []))} results"
        elif isinstance(data, list):
            # Process list response
            return f"Found {len(data)} items"
        else:
            # Fallback for other response types
            return str(data)
