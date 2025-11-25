# ADR-0005: Unified Tool Discovery Service

**Status**: Accepted  
**Date**: 2024-02-10  
**Deciders**: Development Team  
**Tags**: [architecture, tools, discovery, extensibility]

## Context

Tools can come from multiple sources:
- Core tools (hardcoded in `CORE_TOOLS`)
- Marketplace tools (filesystem with `manifest.json`)
- Entry point tools (setuptools entry points)
- Future: Remote tools, plugin tools, etc.

Initially, each source had separate discovery logic:
- `ToolLoader.load_core_tools()` for core tools
- `ToolLoader.scan_marketplace_tools()` for marketplace
- No entry point support

This made it:
- Hard to add new discovery sources
- Difficult to unify tool metadata
- Inconsistent discovery behavior
- Hard to test discovery logic

## Decision

We will create a **unified `ToolDiscoveryService`** that uses the **Strategy Pattern** with multiple `ToolDiscoverer` implementations.

The service will:
- Register multiple discoverers (Entry Point, Marketplace, Fallback)
- Discover tools from all sources
- Unify tool metadata into `DiscoveredTool` objects
- Support priority-based discovery (entry points > marketplace > fallback)
- Be extensible for new discovery sources

## Consequences

### Positive

- **Unified Interface**: Single interface for all discovery sources
- **Extensibility**: Easy to add new discovery sources (just implement `ToolDiscoverer`)
- **Consistency**: All tools discovered through same mechanism
- **Testability**: Each discoverer can be tested independently
- **Flexibility**: Can enable/disable specific discoverers
- **Future-Proof**: Ready for remote tools, plugin tools, etc.

### Negative

- **Abstraction Overhead**: Additional layer of abstraction
- **Complexity**: More classes/interfaces to understand
- **Initial Migration**: Need to migrate existing discovery code

## Alternatives Considered

### 1. Keep Separate Discovery Methods
- **Rejected**: Inconsistent, hard to extend, code duplication

### 2. Single Discovery Method with if/elif
- **Rejected**: Violates Open/Closed Principle, hard to test

### 3. Plugin-Based Discovery
- **Considered**: Similar approach, but plugins are for runtime, discovery is for startup

### 4. Factory Pattern
- **Rejected**: Less flexible, harder to compose multiple discoverers

## Implementation

```python
from backend.src.tools.discovery.base import ToolDiscoverer, ToolDiscoveryService

class EntryPointToolDiscoverer(ToolDiscoverer):
    async def discover(self) -> List[DiscoveredTool]:
        # Discover from entry points
        pass
    
    def get_source_name(self) -> str:
        return "entry_point"

# Register discoverers
discovery_service = ToolDiscoveryService()
discovery_service.register_discoverer(EntryPointToolDiscoverer())
discovery_service.register_discoverer(MarketplaceToolDiscoverer(...))
discovery_service.register_discoverer(FallbackToolDiscoverer(...))

# Discover all tools
all_tools = await discovery_service.discover_all_tools()
```

## Discovery Sources

1. **Entry Points** (Highest Priority)
   - Setuptools entry points: `desktop_assistant.tools`
   - For packaged tools

2. **Marketplace** (Medium Priority)
   - Filesystem scanning: `tools/verified/*/manifest.json`
   - For user-installed tools

3. **Fallback** (Lowest Priority)
   - Hardcoded `CORE_TOOLS` list
   - For backward compatibility

## References

- [Strategy Pattern](https://en.wikipedia.org/wiki/Strategy_pattern)
- [Setuptools Entry Points](https://setuptools.readthedocs.io/en/latest/userguide/entry_point.html)

