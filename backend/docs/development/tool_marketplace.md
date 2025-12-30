# Tool Marketplace

This guide provides comprehensive documentation for the Personal Assistant's tool marketplace system, enabling community-driven tool development, discovery, and management.

## Overview

The tool marketplace provides basic functionality for:

- **Tool Discovery**: Loading tools from the `tools/verified/` directory
- **Security Scanning**: Basic security validation of tool manifests
- **Tool Management**: Loading and caching of marketplace tools

**Note**: The marketplace system is currently basic and does not include advanced features like semantic search, automated updates, or community sharing platforms.

## Architecture

The current marketplace system is simple:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Marketplace   │    │   Tool          │    │   Security      │
│   Manager       │◄──►│   Loader        │◄──►│   Scanner       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### MarketplaceManager

The main component for managing marketplace tools.

```python
from backend.src.tools.marketplace_manager import MarketplaceManager

manager = MarketplaceManager(tool_loader)
await manager.load_marketplace_tools(Path("tools/verified/"))
```

**Key Responsibilities:**
- Tool discovery from the `tools/verified/` directory
- Basic security scanning of tool manifests
- Tool loading and caching
- Tool instance caching and lifecycle management
- Dependency resolution and conflict detection

### ToolSearchEngine

AI-powered semantic search for tool discovery.

```python
from backend.src.tools.marketplace.search import ToolSearchEngine

search_engine = ToolSearchEngine(registry=registry)
search_engine.index_tools()

# Search for tools
results = search_engine.search("weather forecast")
```

**Features:**
- Sentence transformer-based semantic search
- Query expansion and relevance ranking
- Category-based filtering
- Performance optimization through indexing

### SecurityScanner

Automated security analysis for tool code.

```python
from backend.src.tools.marketplace.discovery.security import ToolSecurityScanner

scanner = ToolSecurityScanner()
security_report = await scanner.scan_tool(tool_path)

if security_report.is_safe:
    print("Tool passed security checks")
else:
    print(f"Security issues found: {security_report.issues}")
```

**Security Checks:**
- Code injection vulnerability detection
- File system access validation
- Network request security analysis
- Import safety verification
- Malicious code pattern recognition

## Tool Structure and Packaging

### Tool Directory Structure

Marketplace tools follow a standardized directory structure:

```
tools/verified/weather_tool/
├── manifest.json          # Tool metadata and configuration
├── tool.py               # Main tool implementation
├── requirements.txt      # Python dependencies (optional)
├── README.md             # Documentation
├── tests/                # Test files (optional)
│   └── test_weather.py
└── assets/               # Static assets (optional)
    └── icons/
```

### Tool Manifest

The manifest file defines tool metadata and capabilities:

```json
{
  "name": "weather_lookup",
  "version": "1.0.0",
  "description": "Get weather information for any location",
  "author": "Community Contributor",
  "license": "MIT",
  "tags": ["weather", "forecast", "api"],
  "category": "information",
  "requires": ["requests", "pydantic"],
  "permissions": ["network_access"],
  "schema": {
    "location": {
      "type": "string",
      "description": "City name or coordinates"
    },
    "units": {
      "type": "string",
      "enum": ["metric", "imperial"],
      "default": "metric"
    }
  },
  "examples": [
    {
      "input": {"location": "New York", "units": "metric"},
      "description": "Get weather for New York in Celsius"
    }
  ]
}
```

**Manifest Fields:**
- `name`: Unique tool identifier
- `version`: Semantic version number
- `description`: Human-readable description
- `author`: Tool creator information
- `license`: Open source license
- `tags`: Search keywords
- `category`: Tool category for organization
- `requires`: Python package dependencies
- `permissions`: Required system permissions
- `schema`: Tool argument schema
- `examples`: Usage examples

### Tool Implementation

Tools must inherit from the base Tool class:

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class WeatherArgs(BaseModel):
    """Weather lookup arguments."""
    location: str = Field(..., description="Location to get weather for")
    units: str = Field(default="metric", description="Temperature units")

class WeatherTool(Tool[WeatherArgs]):
    """Weather lookup tool."""

    name = "weather_lookup"
    description = "Get current weather and forecast information"
    args_model = WeatherArgs

    async def run(self, args: WeatherArgs, ctx: Context) -> Dict[str, Any]:
        """Execute weather lookup."""
        try:
            # Tool implementation
            weather_data = await self.get_weather_data(args.location, args.units)

            return {
                "success": True,
                "data": weather_data,
                "llm_content": self.format_weather_response(weather_data),
                "return_display": self.format_user_display(weather_data)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "llm_content": f"Failed to get weather: {e}",
                "return_display": f"Error: {e}"
            }

    async def get_weather_data(self, location: str, units: str) -> Dict[str, Any]:
        """Fetch weather data from API."""
        # Implementation details
        pass

    def format_weather_response(self, data: Dict[str, Any]) -> str:
        """Format data for LLM consumption."""
        return f"Current weather in {data['location']}: {data['temperature']}°{data['units']}, {data['condition']}"

    def format_user_display(self, data: Dict[str, Any]) -> str:
        """Format data for user display."""
        return f"Weather in {data['location']}: {data['temperature']}°{data['units']}, {data['condition']}"
```

## Tool Discovery and Loading

### Automatic Discovery

The marketplace automatically discovers tools from the verified directory:

```python
# Discovery process
discovered_tools = await registry.discover_tools()

for tool_info in discovered_tools:
    print(f"Found tool: {tool_info.name} v{tool_info.version}")
    print(f"Description: {tool_info.description}")
    print(f"Author: {tool_info.author}")
```

### Validation Pipeline

Tools go through a comprehensive validation pipeline:

```python
from backend.src.tools.marketplace.discovery.validator import ToolManifestValidator

validator = ToolManifestValidator()

# Validate manifest
validation_result = await validator.validate_manifest(manifest_path)

if validation_result.is_valid:
    print("Manifest is valid")
else:
    print(f"Validation errors: {validation_result.errors}")

# Validate tool implementation
implementation_result = await validator.validate_implementation(tool_path)

if implementation_result.is_valid:
    print("Tool implementation is valid")
else:
    print(f"Implementation errors: {implementation_result.errors}")
```

**Validation Checks:**
- Manifest schema compliance
- Tool class inheritance verification
- Argument schema consistency
- Import safety analysis
- Dependency availability checking

### Tool Loading and Caching

```python
# Load specific tool
tool_instance = await registry.get_tool_instance("weather_lookup")

# Cache management
await registry.warm_cache()  # Pre-load frequently used tools
await registry.clear_cache()  # Clear tool cache
```

## Search and Discovery

### Semantic Search

Find tools using natural language queries:

```python
# Initialize search engine
search_engine = ToolSearchEngine(registry)
await search_engine.index_tools()

# Search for tools
results = search_engine.search("find weather information")

for result in results:
    print(f"Tool: {result.tool_name}")
    print(f"Score: {result.score}")
    print(f"Description: {result.description}")
    print(f"Tags: {result.tags}")
```

### Advanced Search Features

```python
# Search with filters
filtered_results = search_engine.search(
    query="data analysis",
    filters={
        "category": "analytics",
        "author": "trusted_publisher",
        "min_rating": 4.0
    }
)

# Category browsing
categories = search_engine.get_categories()
analytics_tools = search_engine.get_tools_by_category("analytics")

# Tag-based discovery
popular_tags = search_engine.get_popular_tags()
tagged_tools = search_engine.get_tools_by_tag("api")
```

### Search Optimization

```python
# Build search index
await search_engine.build_index()

# Update index incrementally
await search_engine.update_index(new_tools)

# Optimize search performance
search_engine.optimize_index()
```

## Security and Safety

### Security Scanning

Automated security analysis of tool code:

```python
security_scanner = ToolSecurityScanner()

# Scan tool directory
scan_result = await security_scanner.scan_directory(tool_path)

# Check for vulnerabilities
if scan_result.has_critical_issues:
    print("Critical security issues found - tool rejected")
    for issue in scan_result.critical_issues:
        print(f"CRITICAL: {issue.description}")

# Check for warnings
for warning in scan_result.warnings:
    print(f"WARNING: {warning.description}")
```

**Security Checks:**
- **Code Injection**: Detection of eval(), exec(), and similar
- **File System Access**: Unsafe file operations
- **Network Security**: Insecure HTTP requests, missing SSL verification
- **Import Safety**: Dangerous module imports
- **Resource Exhaustion**: Potential DoS vulnerabilities
- **Privilege Escalation**: System command execution

### Permission System

Tools declare required permissions in their manifest:

```json
{
  "permissions": [
    "network_access",
    "file_system_read",
    "system_commands"
  ]
}
```

**Available Permissions:**
- `network_access`: Internet connectivity
- `file_system_read`: Read files from disk
- `file_system_write`: Write/modify files
- `system_commands`: Execute system commands
- `computer_control`: Mouse/keyboard control
- `clipboard_access`: Read/write clipboard

### Sandboxing and Isolation

```python
# Tool execution in isolated environment
async def execute_tool_safely(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    # Create isolated execution context
    sandbox = ToolSandbox()

    # Execute with resource limits
    result = await sandbox.execute_tool(
        tool_name=tool_name,
        args=args,
        timeout=30,  # seconds
        memory_limit="100MB",
        permissions=tool_manifest.permissions
    )

    return result
```

## Tool Lifecycle Management

### Installation and Updates

```python
# Install tool dependencies
await registry.install_tool_dependencies("weather_tool")

# Check for updates
updates = await registry.check_for_updates()

for update in updates:
    print(f"Update available for {update.tool_name}: {update.current_version} -> {update.new_version}")

# Apply updates
await registry.update_tool("weather_tool")
```

### Dependency Management

```python
# Resolve dependencies
dependencies = await registry.resolve_dependencies("weather_tool")

# Check for conflicts
conflicts = registry.check_dependency_conflicts(dependencies)

if conflicts:
    print("Dependency conflicts detected:")
    for conflict in conflicts:
        print(f"{conflict.package}: {conflict.versions}")

# Install dependencies
await registry.install_dependencies(dependencies)
```

### Tool Removal and Cleanup

```python
# Remove tool
await registry.remove_tool("weather_tool")

# Cleanup orphaned dependencies
await registry.cleanup_dependencies()

# Full marketplace reset
await registry.reset_marketplace()
```

## Quality Assurance and Testing

### Automated Testing

```python
from backend.src.tools.marketplace.testing import ToolTester

tester = ToolTester()

# Run tool tests
test_results = await tester.run_tests("weather_tool")

print(f"Tests passed: {test_results.passed}/{test_results.total}")
print(f"Coverage: {test_results.coverage}%")

if not test_results.passed:
    for failure in test_results.failures:
        print(f"FAILED: {failure.test_name} - {failure.error}")
```

### Performance Monitoring

```python
# Monitor tool performance
metrics = await registry.get_performance_metrics("weather_tool")

print(f"Average execution time: {metrics.avg_execution_time}ms")
print(f"Success rate: {metrics.success_rate}%")
print(f"Error rate: {metrics.error_rate}%")
print(f"Resource usage: {metrics.resource_usage}")
```

### Rating and Reviews

```python
# Submit tool rating
await registry.rate_tool(
    tool_name="weather_tool",
    user_id="user123",
    rating=5,
    review="Excellent weather tool with accurate data!"
)

# Get tool ratings
ratings = await registry.get_tool_ratings("weather_tool")
average_rating = sum(r.rating for r in ratings) / len(ratings)
```

## Configuration

Marketplace configuration through the main application config:

```yaml
marketplace:
  enabled: true
  auto_discovery: true
  security_scanning: true
  search_indexing: true
  cache_enabled: true
  max_cache_size_mb: 500
  update_check_interval_hours: 24

security:
  strict_mode: true
  allowed_permissions:
    - network_access
    - file_system_read
  blocked_imports:
    - os.system
    - subprocess.call
  max_execution_time_seconds: 30

search:
  model_name: "sentence-transformers/all-MiniLM-L6-v2"
  index_update_interval_hours: 6
  max_results: 20
  min_score_threshold: 0.3
```

## Integration with Agent System

### Tool Discovery Integration

```python
# Agent discovers tools dynamically
class IntelligentAgent:
    async def find_relevant_tools(self, user_query: str) -> List[Tool]:
        # Use marketplace search
        search_results = await self.marketplace.search(user_query)

        # Filter by relevance and permissions
        relevant_tools = [
            result for result in search_results
            if result.score > 0.7 and self.check_permissions(result.permissions)
        ]

        # Load tool instances
        tools = []
        for result in relevant_tools:
            tool = await self.marketplace.get_tool_instance(result.tool_name)
            tools.append(tool)

        return tools
```

### Dynamic Tool Loading

```python
# Load tools on demand
async def execute_with_tool(self, task_description: str, context: Dict[str, Any]):
    # Find appropriate tool
    tool = await self.find_tool_for_task(task_description)

    if tool:
        # Execute tool
        result = await tool.run(args=context, ctx=self.execution_context)

        # Learn from execution for future tool selection
        await self.learn_from_execution(tool.name, result.success)

        return result
    else:
        # Fallback to general LLM processing
        return await self.llm_fallback(task_description, context)
```

## Monitoring and Analytics

### Usage Analytics

```python
# Track tool usage
usage_stats = await registry.get_usage_statistics()

for tool_name, stats in usage_stats.items():
    print(f"Tool: {tool_name}")
    print(f"Total executions: {stats.total_executions}")
    print(f"Success rate: {stats.success_rate}%")
    print(f"Average latency: {stats.avg_latency_ms}ms")
    print(f"Last used: {stats.last_used}")
```

### Marketplace Health

```python
# Marketplace health check
health = await registry.health_check()

print(f"Status: {health.status}")
print(f"Total tools: {health.total_tools}")
print(f"Tools loaded: {health.tools_loaded}")
print(f"Security issues: {health.security_issues}")
print(f"Last scan: {health.last_security_scan}")
```

## Current Verified Tools

The marketplace currently includes several high-quality, verified tools that demonstrate different capabilities and use cases:

### CoAct-1 Computer Automation Tool

**Location**: `tools/verified/coact_automation/`

A marketplace tool implementing the CoAct-1 multi-agent architecture for intelligent computer automation using three specialized AI agents:

- **Orchestrator Agent**: Task decomposition and strategic planning
- **Programmer Agent**: Code execution and system operations
- **GUI Operator Agent**: Vision-based graphical user interface interactions

**Capabilities**:
- Intelligent task decomposition for complex computer workflows
- Multi-modal execution combining code and visual GUI interactions
- Advanced OCR integration with text element detection and ID-based clicking
- Precision GUI automation using LLM-powered element matching
- Memory learning with episodic memory contributions
- Local execution with no external dependencies or cloud APIs

**Example Usage**:
```
"Open Firefox and navigate to GitHub"
"Create a text file with 'Hello World' content"
"Take a screenshot and save it as test.png"
```

### Weather Lookup Tool

**Location**: `tools/verified/weather_tool/`

A tool for retrieving current weather information for any location using weather APIs.

**Features**:
- Real-time weather data retrieval
- Location-based weather queries
- Temperature, conditions, and basic forecast data
- API integration with external weather services
- Network access permission for API calls

**Example Usage**:
```
"What's the weather like in New York?"
"Get the forecast for London in Celsius"
```

### Example Tool

**Location**: `tools/verified/example_tool/`

A template tool that serves as a reference implementation for new tool development.

**Purpose**:
- Demonstrates proper tool structure and patterns
- Includes both template files and working examples
- Shows best practices for manifest configuration
- Educational resource for tool developers

### Example Tool

**Location**: `tools/verified/example_tool/`

A demonstration tool that serves as a template and reference implementation for the marketplace system.

**Purpose**:
- Shows proper tool structure and implementation patterns
- Includes both template files and working examples
- Demonstrates manifest configuration best practices
- Educational resource for tool developers

**Features**:
- Simple message echoing functionality
- Complete tool lifecycle implementation
- Input validation and error handling examples
- Documentation and testing examples

**Example Usage**:
```
"Test the example tool with a message"
```

## Troubleshooting

### Common Issues

#### Tool Discovery Failures

```python
# Check directory structure
import os
verified_dir = "tools/verified"

if not os.path.exists(verified_dir):
    print("Verified tools directory missing")
    os.makedirs(verified_dir)

# Validate tool structure
for tool_dir in os.listdir(verified_dir):
    tool_path = os.path.join(verified_dir, tool_dir)
    if not os.path.isdir(tool_path):
        continue

    manifest_path = os.path.join(tool_path, "manifest.json")
    if not os.path.exists(manifest_path):
        print(f"Missing manifest.json in {tool_dir}")
        continue

    # Validate manifest
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
        print(f"Valid manifest found for {tool_dir}")
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in {tool_dir}/manifest.json: {e}")
```

#### Security Scan Failures

```python
# Debug security scanner
scanner = ToolSecurityScanner()
result = await scanner.scan_tool(tool_path)

if result.has_issues:
    print("Security issues found:")
    for issue in result.all_issues:
        print(f"[{issue.severity}] {issue.rule}: {issue.description}")
        print(f"  Location: {issue.location}")
        if issue.suggestion:
            print(f"  Suggestion: {issue.suggestion}")
```

#### Search Index Issues

```python
# Rebuild search index
search_engine = ToolSearchEngine(registry)

try:
    await search_engine.build_index()
    print("Search index built successfully")
except Exception as e:
    print(f"Index building failed: {e}")

# Check index status
status = search_engine.get_index_status()
print(f"Indexed tools: {status.indexed_tools}")
print(f"Index size: {status.index_size_mb}MB")
print(f"Last updated: {status.last_updated}")
```

## API Reference

### MarketplaceRegistry Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `load_marketplace_tools()` | Load all marketplace tools | - | `List[ToolInfo]` |
| `get_tool_instance()` | Get tool instance by name | `tool_name: str` | `Tool` |
| `discover_tools()` | Discover tools in verified directory | - | `List[ToolInfo]` |
| `validate_tool()` | Validate tool manifest and code | `tool_path: str` | `ValidationResult` |
| `install_dependencies()` | Install tool dependencies | `tool_name: str` | `bool` |
| `check_for_updates()` | Check for tool updates | - | `List[UpdateInfo]` |

### ToolSearchEngine Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `search()` | Semantic search for tools | `query: str, filters: dict` | `List[SearchResult]` |
| `index_tools()` | Build search index | - | `None` |
| `update_index()` | Update index with new tools | `tools: List[ToolInfo]` | `None` |
| `get_categories()` | Get available categories | - | `List[str]` |
| `get_tools_by_category()` | Get tools in category | `category: str` | `List[ToolInfo]` |

### ToolSecurityScanner Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `scan_tool()` | Scan tool for security issues | `tool_path: str` | `SecurityReport` |
| `scan_code()` | Scan code for vulnerabilities | `code: str` | `List[SecurityIssue]` |
| `validate_permissions()` | Check permission declarations | `permissions: List[str]` | `bool` |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable marketplace system |
| `auto_discovery` | bool | `true` | Automatically discover tools |
| `security_scanning` | bool | `true` | Enable security scanning |
| `search_indexing` | bool | `true` | Enable semantic search |
| `cache_enabled` | bool | `true` | Enable tool caching |
| `max_cache_size_mb` | int | `500` | Maximum cache size |
| `update_check_interval_hours` | int | `24` | Update check frequency |

This tool marketplace system creates a vibrant ecosystem where community developers can contribute tools while maintaining security, quality, and discoverability standards for the Personal Assistant platform.</contents>
</xai:function_call">
