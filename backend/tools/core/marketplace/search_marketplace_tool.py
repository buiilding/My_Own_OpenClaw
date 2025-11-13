"""
Search Marketplace Tool.

Tool for searching the marketplace for available tools.
"""

import logging
from typing import Any, Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)

# Optional marketplace imports
try:
    from backend.marketplace.search import ToolSearchEngine
except ImportError:
    ToolSearchEngine = None


class SearchMarketplaceTool(Tool):
    """Tool for searching the marketplace for available tools."""

    def __init__(self, config: Any, tool_search_engine: Optional[Any] = None):
        """
        Initialize the search marketplace tool.

        Args:
            config: AppServices instance (dependency injection)
            tool_search_engine: Optional ToolSearchEngine instance for marketplace search
        """
        super().__init__(
            name="search_marketplace",
            description="Search the marketplace for available tools based on a natural language query. Use this when you need a capability that isn't available in the current tool list.",
            kind=Kind.SEARCH,
        )
        self.config = config
        self.tool_search_engine = tool_search_engine

    async def execute_async(
        self,
        context: ToolContext,
        query: str,
        limit: Optional[int] = 5,
    ) -> ToolResult:
        """
        Execute the search marketplace tool.

        Args:
            context: Tool execution context
            query: Natural language search query describing what tool capability is needed
            limit: Maximum number of results to return (default: 5)

        Returns:
            ToolResult with search results
        """
        try:
            if not query or not query.strip():
                return ToolResult(
                    success=False,
                    error="Query parameter is required",
                    llm_content="Error: Query parameter is required",
                    return_display="Error: Query parameter is required",
                )

            if self.tool_search_engine is None:
                return ToolResult(
                    success=False,
                    error="Marketplace search is not available",
                    llm_content="Error: Marketplace search is not available. The marketplace system may not be initialized.",
                    return_display="Marketplace search is not available",
                )

            limit = limit or 5
            if limit < 1 or limit > 20:
                limit = 5

            logger.info(f"Searching marketplace for: {query} (limit: {limit})")

            # Perform search
            results = self.tool_search_engine.search(query, limit=limit)

            if not results:
                content = f"No marketplace tools found matching: '{query}'"
                return ToolResult(
                    success=True,
                    data=[],
                    llm_content=content,
                    return_display="No tools found",
                )

            # Format results
            formatted_results = []
            lines = [f"Found {len(results)} marketplace tool(s) matching '{query}':\n"]

            for i, result in enumerate(results, 1):
                metadata = result.metadata
                tool_info = {
                    "name": result.tool_name,
                    "description": metadata.description,
                    "category": metadata.category,
                    "similarity_score": result.similarity_score,
                }
                formatted_results.append(tool_info)

                # Format for display
                lines.append(
                    f"{i}. {result.tool_name} (score: {result.similarity_score:.3f})"
                )
                lines.append(f"   Category: {metadata.category}")
                lines.append(f"   Description: {metadata.description}")
                if hasattr(metadata.manifest, "tags") and metadata.manifest.tags:
                    lines.append(f"   Tags: {', '.join(metadata.manifest.tags)}")
                lines.append("")

            content = "\n".join(lines)
            display = f"Found {len(results)} tool(s)"

            logger.info(f"Marketplace search returned {len(results)} results")

            return ToolResult(
                success=True,
                data=formatted_results,
                llm_content=content,
                return_display=display,
            )

        except Exception as e:
            logger.error(f"Error in marketplace search tool: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Marketplace search failed: {str(e)}",
                llm_content=f"Error: Marketplace search failed: {str(e)}",
                return_display=f"Search failed: {str(e)}",
            )
