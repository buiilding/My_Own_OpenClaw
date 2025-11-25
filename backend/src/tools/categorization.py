"""
Tool Categorization System.

This module provides categorization and domain grouping for tools,
enabling domain-specific loading and organization.
"""
import logging
from enum import Enum
from typing import Dict, List, Optional, Set
from dataclasses import dataclass

from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class ToolDomain(Enum):
    """Tool domain categories."""
    COMPUTER = "computer"  # Computer control tools (mouse, keyboard, screenshot, etc.)
    FILESYSTEM = "filesystem"  # File operations (read, write, search, etc.)
    SYSTEM = "system"  # System operations (shell, processes, etc.)
    MARKETPLACE = "marketplace"  # Marketplace tools
    MEMORY = "memory"  # Memory-related tools
    LLM = "llm"  # LLM-related tools
    OTHER = "other"  # Uncategorized tools


@dataclass
class ToolCategory:
    """Represents a tool category with metadata."""
    domain: ToolDomain
    name: str
    description: str
    tool_names: Set[str] = None
    
    def __post_init__(self):
        """Initialize tool_names set if not provided."""
        if self.tool_names is None:
            self.tool_names = set()


class ToolCategorizer:
    """
    Service for categorizing and organizing tools by domain.
    
    Provides domain-based grouping and filtering capabilities.
    """
    
    def __init__(self):
        """Initialize the categorizer with default domain mappings."""
        self._domain_mappings: Dict[str, ToolDomain] = {
            # Computer domain
            "mouse": ToolDomain.COMPUTER,
            "keyboard": ToolDomain.COMPUTER,
            "screenshot": ToolDomain.COMPUTER,
            "click": ToolDomain.COMPUTER,
            "scroll": ToolDomain.COMPUTER,
            "ocr": ToolDomain.COMPUTER,
            "predict": ToolDomain.COMPUTER,
            
            # Filesystem domain
            "read_file": ToolDomain.FILESYSTEM,
            "write_file": ToolDomain.FILESYSTEM,
            "list_directory": ToolDomain.FILESYSTEM,
            "search_file": ToolDomain.FILESYSTEM,
            "glob": ToolDomain.FILESYSTEM,
            "replace": ToolDomain.FILESYSTEM,
            
            # System domain
            "shell": ToolDomain.SYSTEM,
            "execute": ToolDomain.SYSTEM,
            
            # Marketplace domain
            "search_marketplace": ToolDomain.MARKETPLACE,
        }
        
        self._categories: Dict[ToolDomain, ToolCategory] = {
            domain: ToolCategory(
                domain=domain,
                name=domain.value,
                description=f"Tools in the {domain.value} domain"
            )
            for domain in ToolDomain
        }
    
    def categorize_tool(self, tool: SDKTool) -> ToolDomain:
        """
        Categorize a tool by its name.
        
        Args:
            tool: Tool instance to categorize
            
        Returns:
            ToolDomain for the tool
        """
        tool_name_lower = tool.name.lower()
        
        # Check for exact matches first
        if tool_name_lower in self._domain_mappings:
            return self._domain_mappings[tool_name_lower]
        
        # Check for partial matches
        for keyword, domain in self._domain_mappings.items():
            if keyword in tool_name_lower:
                return domain
        
        # Check tool name patterns
        if any(keyword in tool_name_lower for keyword in ["mouse", "keyboard", "click", "screenshot", "ocr"]):
            return ToolDomain.COMPUTER
        
        if any(keyword in tool_name_lower for keyword in ["file", "directory", "read", "write", "search"]):
            return ToolDomain.FILESYSTEM
        
        if any(keyword in tool_name_lower for keyword in ["shell", "command", "execute", "process"]):
            return ToolDomain.SYSTEM
        
        if "marketplace" in tool_name_lower:
            return ToolDomain.MARKETPLACE
        
        return ToolDomain.OTHER
    
    def get_tools_by_domain(
        self, 
        tools: List[SDKTool], 
        domain: ToolDomain
    ) -> List[SDKTool]:
        """
        Filter tools by domain.
        
        Args:
            tools: List of tools to filter
            domain: Domain to filter by
            
        Returns:
            List of tools in the specified domain
        """
        return [tool for tool in tools if self.categorize_tool(tool) == domain]
    
    def get_domain_statistics(self, tools: List[SDKTool]) -> Dict[ToolDomain, int]:
        """
        Get statistics about tool distribution across domains.
        
        Args:
            tools: List of tools to analyze
            
        Returns:
            Dictionary mapping domains to tool counts
        """
        stats: Dict[ToolDomain, int] = {domain: 0 for domain in ToolDomain}
        
        for tool in tools:
            domain = self.categorize_tool(tool)
            stats[domain] = stats.get(domain, 0) + 1
        
        return stats
    
    def register_domain_mapping(self, keyword: str, domain: ToolDomain) -> None:
        """
        Register a custom domain mapping.
        
        Args:
            keyword: Tool name keyword to match
            domain: Domain to assign
        """
        self._domain_mappings[keyword.lower()] = domain
        logger.debug(f"Registered domain mapping: {keyword} -> {domain.value}")
    
    def get_category(self, domain: ToolDomain) -> ToolCategory:
        """
        Get category information for a domain.
        
        Args:
            domain: Domain to get category for
            
        Returns:
            ToolCategory instance
        """
        return self._categories[domain]


# Global categorizer instance
_categorizer: Optional[ToolCategorizer] = None


def get_categorizer() -> ToolCategorizer:
    """Get the global tool categorizer instance."""
    global _categorizer
    if _categorizer is None:
        _categorizer = ToolCategorizer()
    return _categorizer

