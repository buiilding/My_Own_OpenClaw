# Core Utilities

This document provides comprehensive documentation for the core utility modules that provide essential functionality across the Personal Assistant Backend system.

## Overview

The core utilities provide foundational functionality for file handling, type detection, schema generation, and other common operations used throughout the system.

## File Utilities

### File Reader (`backend/src/core/utils/file_reader.py`)

The file reader provides unified file reading capabilities with automatic type detection and encoding handling.

#### Features

- Automatic file type detection
- Text and binary file handling
- Encoding detection for text files
- Size limits and safety checks
- Streaming and buffered reading

#### Usage

```python
from backend.src.core.utils.file_reader import FileReader

reader = FileReader()

# Read text file with encoding detection
content = await reader.read_text_file("document.txt")

# Read binary file
data = await reader.read_binary_file("image.png")

# Read with size limit
content = await reader.read_file_with_limit("large_file.txt", max_size=1024*1024)

# Detect file type
file_type = await reader.detect_file_type("unknown_file")
```

#### File Type Detection

```python
class FileType(Enum):
    TEXT = "text"
    BINARY = "binary"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    DOCUMENT = "document"
    ARCHIVE = "archive"
    UNKNOWN = "unknown"
```

### Binary Reader (`backend/src/core/utils/binary_reader.py`)

Specialized binary file handling with format-specific processing.

#### Features

- Binary data validation
- Format-specific parsing
- Size and content validation
- Memory-efficient processing

#### Usage

```python
from backend.src.core.utils.binary_reader import BinaryReader

reader = BinaryReader()

# Read and validate binary data
data = await reader.read_binary_file("data.bin")

# Check if data is valid for a format
is_valid = reader.validate_format(data, "png")

# Extract metadata from binary files
metadata = reader.extract_metadata(data, "image")
```

### Text Reader (`backend/src/core/utils/text_reader.py`)

Advanced text file processing with encoding detection and content analysis.

#### Features

- Multiple encoding detection (UTF-8, UTF-16, ASCII, etc.)
- Content type detection (code, prose, data)
- Line ending normalization
- BOM (Byte Order Mark) handling
- Large file streaming

#### Usage

```python
from backend.src.core.utils.text_reader import TextReader

reader = TextReader()

# Read with automatic encoding detection
content, encoding = await reader.read_with_encoding("file.txt")

# Detect content type
content_type = reader.detect_content_type(content)

# Normalize line endings
normalized = reader.normalize_line_endings(content)

# Stream large files
async for chunk in reader.stream_text_file("large.txt", chunk_size=8192):
    process_chunk(chunk)
```

## File Detection and Metadata

### File Detector (`backend/src/core/utils/file_detector.py`)

Comprehensive file type detection using multiple methods.

#### Detection Methods

- **Magic Bytes**: Binary signature detection
- **Extension Analysis**: File extension mapping
- **Content Analysis**: Text pattern matching
- **MIME Type Detection**: MIME type inference

#### Usage

```python
from backend.src.core.utils.file_detector import FileDetector

detector = FileDetector()

# Detect file type
file_type = await detector.detect_type("file.pdf")
# Returns: FileType.DOCUMENT

# Get MIME type
mime_type = detector.get_mime_type("file.pdf")
# Returns: "application/pdf"

# Check if file is text-based
is_text = detector.is_text_file("file.txt")
# Returns: True
```

### File Metadata (`backend/src/core.utils.file_metadata.py`)

File metadata extraction and analysis.

#### Features

- File system metadata (size, dates, permissions)
- Content-based metadata (encoding, language, structure)
- Image metadata (dimensions, format)
- Document metadata (title, author, pages)

#### Usage

```python
from backend.src.core.utils.file_metadata import FileMetadataExtractor

extractor = FileMetadataExtractor()

# Extract comprehensive metadata
metadata = await extractor.extract_metadata("document.pdf")

print(metadata.size)          # File size in bytes
print(metadata.created)       # Creation date
print(metadata.modified)      # Modification date
print(metadata.encoding)      # Text encoding
print(metadata.language)      # Detected language
print(metadata.pages)         # Page count for documents
```

## Path and File System Utilities

### Path Utils (`backend/src.core.utils.path_utils.py`)

Cross-platform path handling and validation.

#### Features

- Path normalization and resolution
- Safety checks for path traversal
- Workspace-relative path handling
- Cross-platform compatibility

#### Usage

```python
from backend.src.core.utils.path_utils import PathUtils

utils = PathUtils()

# Normalize path
normalized = utils.normalize_path("~/documents/file.txt")

# Resolve relative to workspace
absolute = utils.resolve_workspace_path("data/file.txt", "/workspace")

# Validate path safety
is_safe = utils.is_safe_path("/workspace", "/workspace/../outside.txt")
# Returns: False (path traversal attempt)

# Get relative path
relative = utils.get_relative_path("/workspace/docs", "/workspace/docs/file.txt")
# Returns: "file.txt"
```

## Schema and Type System

### Schema Generator (`backend/src/core/utils/schema_generator.py`)

Automatic JSON schema generation for Python objects and Pydantic models.

#### Features

- Pydantic model schema generation
- Custom type schema creation
- Schema validation and optimization
- OpenAPI/Swagger compatibility

#### Usage

```python
from backend.src.core.utils.schema_generator import SchemaGenerator
from pydantic import BaseModel

class UserModel(BaseModel):
    name: str
    age: int
    email: Optional[str] = None

generator = SchemaGenerator()

# Generate JSON schema
schema = generator.generate_schema(UserModel)

# Generate OpenAPI schema
openapi_schema = generator.generate_openapi_schema(UserModel)

# Validate data against schema
is_valid = generator.validate_data(data, schema)
```

## MIME Types and File Extensions

### MIME Types (`backend/src/core/utils/mime_types.py`)

Comprehensive MIME type database and utilities.

#### Features

- MIME type lookup by extension
- Extension lookup by MIME type
- MIME type validation
- Custom MIME type registration

#### Usage

```python
from backend.src.core.utils.mime_types import MimeTypes

mime_utils = MimeTypes()

# Get MIME type for extension
mime_type = mime_utils.get_mime_type(".pdf")
# Returns: "application/pdf"

# Get extensions for MIME type
extensions = mime_utils.get_extensions("application/pdf")
# Returns: [".pdf"]

# Check if MIME type is text-based
is_text = mime_utils.is_text_mime_type("text/plain")
# Returns: True

# Validate MIME type format
is_valid = mime_utils.validate_mime_type("application/json")
# Returns: True
```

### File Extensions (`backend/src/core/utils/file_extensions.py`)

File extension database and categorization.

#### Features

- Extension categorization (text, image, video, etc.)
- Safe extension validation
- Extension normalization

#### Usage

```python
from backend.src.core.utils.file_extensions import FileExtensions

ext_utils = FileExtensions()

# Get category for extension
category = ext_utils.get_category(".py")
# Returns: "code"

# Check if extension is safe
is_safe = ext_utils.is_safe_extension(".txt")
# Returns: True

# Get all extensions in category
code_exts = ext_utils.get_extensions_in_category("code")
# Returns: [".py", ".js", ".java", ...]

# Normalize extension
normalized = ext_utils.normalize_extension("TXT")
# Returns: ".txt"
```

## Type System Utilities

### File Type (`backend/src/core/utils/file_type.py`)

Unified file type classification system.

#### Type Categories

```python
class FileCategory(Enum):
    TEXT = "text"
    BINARY = "binary"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    DOCUMENT = "document"
    ARCHIVE = "archive"
    EXECUTABLE = "executable"
    UNKNOWN = "unknown"
```

#### Usage

```python
from backend.src.core.utils.file_type import FileTypeClassifier

classifier = FileTypeClassifier()

# Classify file
category = await classifier.classify_file("video.mp4")
# Returns: FileCategory.VIDEO

# Get file type info
info = classifier.get_type_info("document.pdf")
# Returns: {"category": "document", "description": "PDF document"}

# Check if file type is supported
supported = classifier.is_supported_type("image.png")
# Returns: True
```

## Utility Integration

### Unified File Utils

The utilities work together to provide comprehensive file handling:

```python
from backend.src.core.utils import (
    FileReader, FileDetector, FileMetadataExtractor,
    PathUtils, MimeTypes
)

class FileProcessor:
    """Example integration of multiple utilities."""

    def __init__(self):
        self.reader = FileReader()
        self.detector = FileDetector()
        self.metadata_extractor = FileMetadataExtractor()
        self.path_utils = PathUtils()
        self.mime_types = MimeTypes()

    async def process_file(self, file_path: str) -> Dict[str, Any]:
        """Process a file using multiple utilities."""

        # Validate and normalize path
        safe_path = self.path_utils.normalize_path(file_path)

        # Detect file type
        file_type = await self.detector.detect_type(safe_path)

        # Get MIME type
        mime_type = self.mime_types.get_mime_type(safe_path)

        # Extract metadata
        metadata = await self.metadata_extractor.extract_metadata(safe_path)

        # Read content if appropriate
        if file_type == "text":
            content = await self.reader.read_text_file(safe_path)
        else:
            content = None

        return {
            "path": safe_path,
            "type": file_type,
            "mime_type": mime_type,
            "metadata": metadata,
            "content": content
        }
```

## Performance and Caching

### Caching Strategies

```python
from functools import lru_cache
import asyncio
from typing import Dict, Any
import time

class CachedFileUtils:
    """Utilities with caching for performance."""

    def __init__(self):
        self._metadata_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 300  # 5 minutes

    @lru_cache(maxsize=100)
    def get_mime_type_cached(self, filename: str) -> str:
        """Cache MIME type lookups."""
        return self.mime_types.get_mime_type(filename)

    async def get_metadata_cached(self, path: str) -> Dict[str, Any]:
        """Cache file metadata with TTL."""
        cache_key = f"{path}:{int(time.time() / self._cache_ttl)}"

        if cache_key not in self._metadata_cache:
            self._metadata_cache[cache_key] = await self.metadata_extractor.extract_metadata(path)

            # Clean old cache entries
            current_time = time.time()
            old_keys = [
                k for k in self._metadata_cache.keys()
                if current_time - float(k.split(':')[1]) * self._cache_ttl > self._cache_ttl
            ]
            for old_key in old_keys:
                del self._metadata_cache[old_key]

        return self._metadata_cache[cache_key]
```

## Error Handling

### Utility Error Classes

```python
class FileUtilsError(Exception):
    """Base error for file utilities."""
    pass

class FileNotFoundError(FileUtilsError):
    """File not found error."""
    pass

class FileAccessError(FileUtilsError):
    """File access permission error."""
    pass

class FileTypeError(FileUtilsError):
    """Unsupported file type error."""
    pass

class EncodingError(FileUtilsError):
    """Text encoding detection/parsing error."""
    pass
```

### Error Handling Patterns

```python
async def safe_read_file(file_path: str) -> str:
    """Safely read a file with comprehensive error handling."""
    try:
        # Validate path
        if not await self.path_utils.is_safe_path(self.workspace_root, file_path):
            raise FileAccessError("Path traversal detected")

        # Check file exists and is readable
        if not await self.file_reader.file_exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Detect file type
        file_type = await self.file_detector.detect_type(file_path)
        if not self.file_type_classifier.is_supported_type(file_path):
            raise FileTypeError(f"Unsupported file type: {file_type}")

        # Read content
        if file_type == "text":
            content = await self.file_reader.read_text_file(file_path)
        else:
            raise FileTypeError("Binary files not supported for text reading")

        return content

    except (FileNotFoundError, FileAccessError, FileTypeError) as e:
        logger.error(f"File operation failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error reading file {file_path}: {e}")
        raise FileUtilsError(f"Failed to read file: {str(e)}") from e
```

## Testing Utilities

### Test Helpers

```python
import tempfile
import os
from pathlib import Path

class FileUtilsTestHelper:
    """Helper for testing file utilities."""

    def create_temp_file(self, content: str = "test content", suffix: str = ".txt") -> str:
        """Create a temporary file for testing."""
        with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False) as f:
            f.write(content)
            return f.name

    def create_temp_binary_file(self, data: bytes, suffix: str = ".bin") -> str:
        """Create a temporary binary file for testing."""
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            return f.name

    def cleanup_temp_file(self, path: str):
        """Clean up temporary file."""
        try:
            os.unlink(path)
        except OSError:
            pass
```

This core utilities documentation provides the foundation for understanding the low-level file handling, type detection, and utility functions that support the Personal Assistant Backend system.
