# Marketplace Module

The Marketplace module provides a system for discovering, validating, and executing community tools from the `tools/verified/` directory.

## Structure

- `registry.py` - Main marketplace registry for tool discovery and management
- `search.py` - Semantic search engine for finding relevant tools
- `discovery/` - Tool discovery and validation submodule
  - `validator.py` - Manifest validation logic
  - `security.py` - Security scanning for tool code

## Components

### MarketplaceRegistry

The main registry that:
- Discovers tools from the `tools/verified/` directory
- Validates tool manifests
- Performs security scans
- Manages tool instantiation and caching

### ToolSearchEngine

Provides semantic search capabilities to find relevant tools based on natural language queries using sentence transformers.

### Discovery Module

Handles the discovery and validation process:
- **ToolManifestValidator**: Validates tool manifests against schema
- **ToolSecurityScanner**: Scans tool code for security vulnerabilities

## Usage

```python
from backend.marketplace import MarketplaceRegistry, ToolSearchEngine

# Initialize registry
registry = MarketplaceRegistry()
await registry.load_marketplace_tools()

# Search for tools
search_engine = ToolSearchEngine(registry)
search_engine.index_tools()
results = search_engine.search("weather forecast")

# Get tool instance
tool = await registry.get_tool_instance("weather_lookup")
```

## Tool Structure

Tools should be placed in `tools/verified/{tool_name}/` with:
- `manifest.json` - Tool metadata and configuration
- `tool.py` - Tool implementation (must inherit from `backend.src.sdk.tool.Tool`)
- `README.md` - Documentation (optional)
