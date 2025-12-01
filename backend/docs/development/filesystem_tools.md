# Filesystem Tools

This guide provides comprehensive documentation for the Personal Assistant's filesystem tools, enabling the AI agent to interact with the local file system for reading, writing, searching, and managing files and directories.

## Overview

The filesystem tools provide safe, controlled access to the local file system with comprehensive file operations:

- **File Reading**: Read single files or multiple files with content analysis
- **File Writing**: Create and modify files with safety checks
- **Directory Operations**: List, navigate, and manage directories
- **Search Operations**: Find files by content, name patterns, or metadata
- **File Replacement**: Safe text replacement with backup and validation

## Architecture

The filesystem system consists of several specialized tools:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File Reader   │    │   File Writer   │    │   Directory     │
│   Tools         │◄──►│   Tools         │◄──►│   Tools         │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ReadFile      │    │   WriteFile     │    │   ListDir       │
│   Tool          │    │   Tool          │    │   Tool          │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### FileSystemInterface

The foundation for all filesystem operations:

```python
from backend.src.tools.filesystem.filesystem_interface import FileSystemInterface

interface = FileSystemInterface(safety_enabled=True)
await interface.initialize()
```

**Safety Features:**
- Path validation and normalization
- Permission checking for file operations
- File size limits and content validation
- Backup creation for destructive operations

## Tool Implementations

### ReadFileTool

Reads the contents of a single file with optional line range selection.

```python
from backend.src.tools.filesystem.read_file_tool_sdk import ReadFileTool

read_tool = ReadFileTool()

# Read entire file
result = await read_tool.run(ReadFileArgs(
    file_path="/path/to/file.txt"
))

# Read specific lines
result = await read_tool.run(ReadFileArgs(
    file_path="/path/to/file.txt",
    offset=10,
    limit=50
))
```

**Features:**
- Automatic file type detection
- Binary file handling
- Large file chunking
- Encoding detection and conversion

### ReadManyFilesTool

Reads multiple files simultaneously for batch processing.

```python
from backend.src.tools.filesystem.read_many_files_tool import ReadManyFilesTool

read_many_tool = ReadManyFilesTool()

result = await read_many_tool.run(ReadManyFilesArgs(
    file_paths=[
        "/path/to/file1.txt",
        "/path/to/file2.txt",
        "/path/to/file3.txt"
    ]
))
```

**Features:**
- Parallel file reading
- Progress tracking
- Memory-efficient batching
- Error aggregation

### WriteFileTool

Creates or modifies files with content validation.

```python
from backend.src.tools.filesystem.write_file_tool import WriteFileTool

write_tool = WriteFileTool()

# Create new file
result = await write_tool.run(WriteFileArgs(
    file_path="/path/to/new_file.txt",
    content="Hello, World!"
))

# Append to existing file
result = await write_tool.run(WriteFileArgs(
    file_path="/path/to/existing_file.txt",
    content="\nAdditional content",
    append=True
))
```

**Safety Features:**
- Atomic write operations
- Backup creation before modification
- Content validation
- Permission checking

### ReplaceTool

Performs safe text replacement in files with pattern matching.

```python
from backend.src.tools.filesystem.replace_tool import ReplaceTool

replace_tool = ReplaceTool()

result = await replace_tool.run(ReplaceFileArgs(
    file_path="/path/to/file.txt",
    old_string="old text",
    new_string="new text",
    replace_all=True
))
```

**Features:**
- Regex pattern support
- Single or multi-occurrence replacement
- Preview mode for validation
- Undo capability

### SearchFileContentTool

Searches for text patterns within files using advanced search algorithms.

```python
from backend.src.tools.filesystem.search_file_content_tool import SearchFileContentTool

search_tool = SearchFileContentTool()

result = await search_tool.run(SearchFileContentArgs(
    pattern="search term",
    path="/path/to/search",
    case_insensitive=True,
    recursive=True
))
```

**Features:**
- Regex and literal text search
- Case-sensitive/insensitive modes
- File type filtering
- Context line inclusion

### ListDirectoryTool

Lists directory contents with filtering and metadata.

```python
from backend.src.tools.filesystem.list_directory_tool import ListDirectoryTool

list_tool = ListDirectoryTool()

result = await list_tool.run(ListDirectoryArgs(
    directory_path="/path/to/directory",
    recursive=False,
    include_hidden=False
))
```

**Features:**
- Recursive directory traversal
- File metadata (size, modified time, permissions)
- Pattern-based filtering
- Sorting options

### GlobTool

Advanced file pattern matching using glob syntax.

```python
from backend.src.tools.filesystem.glob_tool import GlobTool

glob_tool = GlobTool()

result = await glob_tool.run(GlobArgs(
    pattern="*.txt",
    directory_path="/path/to/search",
    recursive=True
))
```

**Features:**
- Full glob pattern support
- Recursive directory searching
- Multiple pattern matching
- Result sorting and limiting

## Tool Classes Reference

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `ReadFileTool` | Single file reading | Line range selection, encoding detection |
| `ReadManyFilesTool` | Batch file reading | Parallel processing, progress tracking |
| `WriteFileTool` | File creation/modification | Atomic writes, backup creation |
| `ReplaceTool` | Text replacement | Regex support, undo capability |
| `SearchFileContentTool` | Content searching | Advanced pattern matching, context |
| `ListDirectoryTool` | Directory listing | Metadata, filtering, sorting |
| `GlobTool` | Pattern matching | Glob syntax, recursive search |

## Configuration

Filesystem tools are configured through the main application config:

```yaml
tools:
  filesystem:
    enabled: true
    safety:
      max_file_size: 100MB
      allowed_extensions: ['.txt', '.md', '.py', '.json']
      backup_enabled: true
    read:
      chunk_size: 8192
      encoding_detection: true
    write:
      atomic_writes: true
      validate_content: true
```

## Security Considerations

### Access Control
- **Path Validation**: All paths are normalized and validated
- **Permission Checking**: Tools verify read/write permissions
- **Sandboxing**: Operations are contained within allowed directories
- **Audit Logging**: All file operations are logged for security review

### Safety Measures
- **File Size Limits**: Prevent memory exhaustion from large files
- **Content Validation**: Check for malicious content patterns
- **Backup Creation**: Automatic backups before destructive operations
- **Rate Limiting**: Prevent excessive file system operations

## Usage Examples

### Reading a Configuration File
```python
result = await read_file_tool.run(ReadFileArgs(
    file_path="config/settings.json"
))
config = json.loads(result.content)
```

### Bulk File Processing
```python
# Find all Python files
python_files = await glob_tool.run(GlobArgs(
    pattern="**/*.py",
    directory_path="/project/src"
))

# Read and analyze each file
for file_path in python_files.matches:
    content = await read_file_tool.run(ReadFileArgs(
        file_path=file_path
    ))
    # Analyze content...
```

### Safe File Modification
```python
# Create backup automatically
result = await replace_tool.run(ReplaceFileArgs(
    file_path="important.txt",
    old_string="old_value",
    new_string="new_value",
    create_backup=True
))
```

## Error Handling

Filesystem tools provide comprehensive error handling:

- **FileNotFoundError**: File doesn't exist
- **PermissionError**: Insufficient permissions
- **FileTooLargeError**: File exceeds size limits
- **EncodingError**: Unable to decode file content
- **PathValidationError**: Invalid or unsafe path

## Performance Optimization

- **Chunked Reading**: Large files read in configurable chunks
- **Parallel Processing**: Multiple files read concurrently
- **Caching**: File metadata cached for repeated operations
- **Lazy Loading**: Content loaded only when needed

## Integration with Other Systems

Filesystem tools integrate seamlessly with:
- **Memory System**: File content stored for semantic search
- **Agent Orchestrator**: File operations triggered by AI decisions
- **Security Framework**: All operations validated against permissions
- **Logging System**: Comprehensive audit trails

## Development Guidelines

When extending filesystem tools:

1. **Follow Safety Patterns**: Always validate paths and permissions
2. **Implement Proper Error Handling**: Use custom exceptions for different error types
3. **Add Comprehensive Logging**: Log all file operations for debugging
4. **Write Unit Tests**: Cover edge cases and error conditions
5. **Document New Features**: Update this guide for new capabilities

## Troubleshooting

### Common Issues

**Permission Denied Errors:**
- Check file permissions
- Verify user has read/write access
- Ensure parent directories exist

**File Not Found:**
- Verify correct path
- Check for case sensitivity
- Confirm file exists

**Encoding Issues:**
- Use explicit encoding parameter
- Check file encoding with detection tools
- Handle binary files appropriately

**Performance Problems:**
- Use appropriate chunk sizes
- Consider parallel processing for multiple files
- Monitor memory usage for large files</contents>
</xai:function_call">The file backend/docs/filesystem_tools.md has been created.

Now let me create documentation for system tools (shell/terminal operations). I'll create a `system_tools.md` file.

<xai:function_call name="write">
<parameter name="file_path">backend/docs/system_tools.md
