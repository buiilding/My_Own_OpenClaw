---
summary: "Deep reference for Browser Use file system runtime: typed file adapters, filename sanitization/validation policy, external/internal read semantics, replacement/write flows, and serializable state restore behavior."
read_when:
  - When changing `browser_use/filesystem/file_system.py` file-type support or file operation behavior.
  - When debugging filename rejection messages, large PDF/image read behavior, or state replay across agent checkpoints.
title: "Browser Use File System Runtime, File Type Adapters, and State Persistence Contract Reference"
---

# Browser Use File System Runtime, File Type Adapters, and State Persistence Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/filesystem/file_system.py`

## Core Types and Constraints

Constants and errors:

- `UNSUPPORTED_BINARY_EXTENSIONS` blocks write paths for images/media/archives/binaries
- `_build_filename_error_message(...)` returns user-facing, extension-specific rejection guidance
- `DEFAULT_FILE_SYSTEM_PATH = browseruse_agent_data`
- `FileSystemError` marks user-visible filesystem failures

State model:

- `FileSystemState` stores serialized files, base directory, and extracted-content counter

## File Adapter Contract (`BaseFile` + concrete classes)

`BaseFile` defines shared behavior:

- internal `name` + `content`
- async and sync disk sync helpers
- write/append/read surface
- computed `full_name`, size, and line count

Concrete adapters:

- text-like: `MarkdownFile`, `TxtFile`, `JsonFile`, `JsonlFile`, `CsvFile`, `HtmlFile`, `XmlFile`
- document-like: `PdfFile`, `DocxFile`

Special writer behavior:

- `PdfFile.sync_to_disk_sync(...)` uses `reportlab` and converts markdown-like headings to paragraph styles
- `DocxFile.sync_to_disk_sync(...)` uses `python-docx` with heading level mapping

## Filesystem Initialization and Storage Layout

`FileSystem.__init__(...)` behavior:

- normalizes base directory and ensures existence
- hard-resets dedicated working subdir (`browseruse_agent_data`) per instance construction
- registers extension-to-file-class map
- optionally creates default file set (`todo.md`)

## Filename Policy and Sanitization

Validation:

- `_is_valid_filename(...)` enforces `name.extension` with allowed chars (`letters`, `numbers`, `_`, `-`, `.`, `()`, spaces, CJK)
- extension must be in registered type set

Sanitization:

- `sanitize_filename(...)` lowercases extension, replaces spaces with hyphens, strips invalid chars, collapses multiple hyphens
- `_resolve_filename(...)` always applies basename extraction first (directory traversal hardening)
- returns `(resolved_name, was_changed)` for auto-correction messaging

## Read Behavior Contract

Internal reads (`read_file_structured(..., external_file=False)`):

- validates/sanitizes filename, reads from in-memory map, returns `<content>` wrapped message
- preserves auto-correction notes when filename was sanitized

External reads (`external_file=True`):

- text-like: async text read (`anyio`)
- `docx`: paragraph extraction
- `pdf`:
  - extracts all pages when under char budget
  - when large, computes IDF-like score per page and includes highest-priority pages under 60k-char budget
  - appends skipped-page guidance
- image (`jpg/jpeg/png`): returns base64 payload in `images` field

`read_file(...)` is a thin string-only wrapper over structured response.

## Write/Append/Replace Contract

`write_file(...)`:

- validate/sanitize filename
- create typed file object if missing
- write content and sync to disk
- includes auto-correction note in success message when needed

`append_file(...)`:

- requires existing file object
- append content and sync to disk

`replace_file_str(...)`:

- rejects empty `old_str`
- applies global string replacement over current content
- writes result back through adapter

`save_extracted_content(...)`:

- writes numbered markdown files (`extracted_content_<n>.md`)
- increments `extracted_content_count`

## Describe and Todo Surface

`describe()`:

- lists non-`todo.md` files as `<file>` entries
- full content for short files
- start/end previews with middle-line elision for larger files

`get_todo_contents()`:

- convenience read path for `todo.md`

## State Serialization and Recovery

`get_state()`:

- serializes each file object as `{type, data}`
- includes base dir and extracted-content counter

`from_state(...)`:

- reconstructs filesystem at original base directory
- restores files by concrete class map and syncs to disk
- skips unknown file types safely

`nuke()`:

- removes managed data directory recursively

## Related Docs

- [Frontend Sidecar Browser Use Filesystem Docs Hub](README.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)
- [Frontend Sidecar Browser Use Agent Docs Hub](../agent/README.md)
