"""
Search Marketplace Tool (SDK Version)

Tool for searching the marketplace for available tools.
"""
import logging
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

logger = logging.getLogger(__name__)

# Optional marketplace imports
try:
    from backend.src.tools.marketplace.search import ToolSearchEngine
except ImportError:
    ToolSearchEngine = None


class SearchMarketplaceArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    query: str = Field(..., description="Natural language search query describing what tool capability is needed")
    limit: Optional[int] = Field(5, ge=1, le=20, description="Maximum number of results to return (default: 5, max: 20)")


class SearchMarketplaceTool(Tool[SearchMarketplaceArgs]):
    """Tool for searching the marketplace for available tools."""
    
    name = "search_marketplace"
    description = "Search the marketplace for available tools based on a natural language query. Use this when you need a capability that isn't available in the current tool list."
    args_model = SearchMarketplaceArgs

    def __init__(self, tool_search_engine: Optional[ToolSearchEngine] = None):
        """
        Initialize the search marketplace tool.
        
        Args:
            tool_search_engine: Optional ToolSearchEngine instance for marketplace search
        """
        self.tool_search_engine = tool_search_engine

    async def run(self, args: SearchMarketplaceArgs, ctx: Context) -> dict:
        """
        Execute the search marketplace tool.
        
        Args:
            args: Search marketplace arguments
            ctx: Execution context
            
        Returns:
            Dictionary with search results
        """
        try:
            if not args.query or not args.query.strip():
                return {
                    "error": "Query parameter is required",
                    "llm_content": "Error: Query parameter is required"
                }

            # Get tool search engine from context services if not provided
            if self.tool_search_engine is None:
                tool_search_engine = ctx.services.get("tool_search_engine")
                if tool_search_engine is None:
                    return {
                        "error": "Marketplace search is not available",
                        "llm_content": "Error: Marketplace search is not available. The marketplace system may not be initialized."
                    }
            else:
                tool_search_engine = self.tool_search_engine

            # Get default limit from config if available
            config = ctx.services.get("config")
            default_limit = config.marketplace_search_limit if config and hasattr(config, "marketplace_search_limit") else 5
            
            limit = args.limit or default_limit
            if limit < 1 or limit > 20:
                limit = default_limit

            logger.info(f"Searching marketplace for: {args.query} (limit: {limit})")

            # Perform search
            results = tool_search_engine.search(args.query, limit=limit)

            if not results:
                content = f"No marketplace tools found matching: '{args.query}'"
                return {
                    "results": [],
                    "llm_content": content,
                    "return_display": "No tools found"
                }

            # Format results
            formatted_results = []
            lines = [f"Found {len(results)} marketplace tool(s) matching '{args.query}':\n"]

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

            return {
                "results": formatted_results,
                "llm_content": content,
                "return_display": display
            }

        except Exception as e:
            logger.error(f"Error in marketplace search tool: {e}", exc_info=True)
            return {
                "error": f"Marketplace search failed: {str(e)}",
                "llm_content": f"Error: Marketplace search failed: {str(e)}"
            }
