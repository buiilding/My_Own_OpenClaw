# Tool Development Templates

This directory contains templates and examples to help developers create new tools for the Desktop Assistant.

## Available Templates

### `basic_tool_template.py`
- **Purpose**: Minimal starting point for simple tools
- **Use when**: Creating basic tools with straightforward logic
- **Features**: Basic structure, parameter handling, error handling

### `filesystem_tool_template.py`
- **Purpose**: Template for tools that work with files and directories
- **Use when**: Creating tools that read, write, or manipulate files
- **Features**: Workspace validation, file service integration, security checks

### `web_tool_template.py`
- **Purpose**: Template for tools that interact with web APIs
- **Use when**: Creating tools that make HTTP requests or call web services
- **Features**: Async HTTP handling, authentication, timeout management

### `advanced_tool_template.py`
- **Purpose**: Comprehensive template with full feature support
- **Use when**: Creating complex tools with validation, retries, and memory
- **Features**: Parameter validation, capabilities, memory payloads, error recovery

## How to Use Templates

1. **Copy a template** to your new tool location:
   ```bash
   cp backend/tools/templates/basic_tool_template.py backend/tools/core/utils/my_new_tool.py
   ```

2. **Rename the class** from `ToolName` to your tool's class name

3. **Update the tool properties**:
   - `name`: Unique identifier (snake_case)
   - `description`: What the tool does
   - `kind`: Tool.Kind enum value

4. **Implement the `execute_async` method** with your tool's logic

5. **Update parameter validation** in `validate_parameters()` if needed

6. **Register the tool** in `backend/tools/registry.py`:
   ```python
   from backend.tools.core.utils.my_new_tool import MyNewTool
   # ...
   self.register_tool(MyNewTool(self.services))
   ```

## Template Features

### Basic Template Features
- ✅ Tool class structure
- ✅ Parameter handling with type hints
- ✅ Basic error handling
- ✅ ToolResult formatting

### Filesystem Template Features
- ✅ AppServices integration
- ✅ Workspace path validation
- ✅ File service usage
- ✅ Permission error handling

### Web Template Features
- ✅ Async HTTP requests with aiohttp
- ✅ Authentication headers
- ✅ Timeout handling
- ✅ JSON response processing

### Advanced Template Features
- ✅ Comprehensive parameter validation
- ✅ Capabilities declaration
- ✅ Memory payload generation
- ✅ Retry logic with exponential backoff
- ✅ Performance monitoring
- ✅ Context validation
- ✅ Detailed error handling

## Best Practices

1. **Choose the right template** based on your tool's complexity
2. **Use type hints** for all parameters
3. **Implement proper error handling** with meaningful messages
4. **Validate parameters** before execution
5. **Use AppServices** for filesystem and system operations
6. **Generate memory payloads** for important operations
7. **Test thoroughly** with edge cases

## Tool Registration

After creating your tool, register it in the appropriate location:

- **Built-in tools**: Add to `backend/tools/registry.py`
- **Community tools**: Place in `backend/marketplace/` directory

See `docs/tool_development.md` for detailed registration instructions.
