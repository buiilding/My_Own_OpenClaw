# Local Runtime Python Sidecar Folder Structure

## Overview

The local-runtime Python sidecar provides local tool execution, memory management, system state collection, and wakeword detection for the Electron desktop application. The SDK-owned local runtime starts `sidecar_daemon.py`, then sends JSON-RPC 2.0 envelopes to the daemon HTTP `/rpc` endpoint.

---

## Folder Structure

```
frontend/src/main/python/
├── sidecar_daemon.py                   # HTTP/WebSocket daemon entrypoint for SDK local-runtime /rpc, tools, plugins, MCP, events, and shutdown
├── local_backend.py                    # LocalRuntimeService implementation - JSON-RPC method registry, tool execution, memory operations, system state
├── wakeword_service.py                # Wakeword detection service - openWakeWord integration, binary protocol over stdin/stdout
├── requirements.txt                    # Python dependencies (faiss-cpu, aiosqlite, aiohttp, pyautogui, pynput, psutil, etc.)
│
├── core/                               # Core infrastructure modules
│   ├── ipc_protocol.py                # JSONRPCProtocol - transport-independent JSON-RPC 2.0 request validation and dispatch
│   ├── remote_semantic_client.py      # RemoteSemanticClient - HTTP client for backend semantic summarization API
│   ├── system_state.py                # get_system_state() - Cross-platform system state collection (active window, mouse, clipboard, stats)
│   ├── executors.py                   # Shared interactive/background ThreadPoolExecutor lifecycle for blocking operations
│   │
│   └── platform/                       # Platform-specific abstractions
│       ├── window_manager.py          # Platform detection and WindowManager selection
│       ├── base.py                    # BaseWindowManager - Abstract base class for window management
│       ├── windows.py                 # WindowsWindowManager - Windows implementation using win32gui
│       ├── macos.py                   # MacOSWindowManager - macOS implementation using AppKit
│       └── linux.py                   # LinuxWindowManager - Linux implementation using xdotool
│
├── memory/                             # Memory storage system
│   ├── local_store.py                # LocalMemoryStore - SQLite + FAISS implementation with SDK-provided embeddings (separate DBs for episodic/semantic)
│   └── summarizer.py                 # MemorySummarizer - Periodic episodic -> semantic consolidation
│
└── tools/                              # Tool implementations and registry
    ├── registry.py                    # ToolRegistry - Tool registration and execution with Pydantic validation
    ├── result.py                      # ToolResult - Standardized tool result dataclass
    ├── schemas.py                     # Pydantic schemas for all tools (MouseControlArgs, KeyboardControlArgs, etc.)
    │
    ├── computer/                      # Computer control tools
    │   ├── keyboard_tool.py           # execute_keyboard_control() - Keyboard input (type/paste/press/hotkey) with clipboard-safe paste for multiline/long text
    │   ├── mouse_tool.py              # execute_mouse_control() - Mouse actions (click, move, drag, scroll) using pyautogui
    │   ├── screenshot_tool.py         # capture_screenshot() - Screenshot capture with JPEG compression using pyautogui/PIL
    │   └── scroll_tool.py             # execute_scroll_control() - Scroll control (scroll, scroll_up, scroll_down) using pyautogui
    │
    ├── filesystem/                     # Filesystem tools
    │   ├── file_utils.py              # Binary file detection, encoding detection utilities
    │   ├── gitignore_utils.py         # Gitignore parsing and filtering using pathspec
    │   ├── read_file_tool.py          # read_file() - File reading with binary detection, size limits, pagination
    │   ├── replace_engine.py          # Replacement engine orchestration and validation
    │   ├── replace_matchers.py        # Exact and lenient match discovery helpers
    │   ├── replace_patch_chunks.py    # Structured patch chunk parsing helpers
    │   └── replace_tool.py            # replace() - Find-and-replace with line ending normalization
    │
    └── system/                         # System tools
        ├── shell_tool.py              # run_shell_command() - Shell command execution with background sessions
        ├── shell_process_registry.py  # Background shell session registry
        ├── process_tool.py            # process() - Manage background shell sessions (poll/log/write/kill)
        ├── stats_tool.py              # get_system_stats() - System statistics (CPU, memory, battery) using psutil
        ├── wait_tool.py               # wait() - Wait tool (returns immediately; SDK local runtime coordinates delay)
        └── window_tool.py            # switch_to_window(), get_open_windows() - Window management using platform abstraction
```

---

## Data Flow

### Python Sidecar Runtime Flow

```
1. SDK LOCAL RUNTIME
   └─> Starts or reuses Python daemon (sidecar_daemon.py)
       └─> HTTP /rpc for JSON-RPC 2.0 envelopes
           ↓
2. INITIALIZATION
   └─> sidecar_daemon.py
       ├─> LocalRuntimeService.__init__() from local_backend.py
       │   ├─> JSONRPCProtocol() - Initialize protocol handler
       │   └─> ToolRegistry() - Register all tools
       │
       └─> LocalRuntimeService.initialize()
           └─> LocalMemoryStore.initialize()
               ├─> Load/create SQLite databases (episodic.db, semantic.db)
               ├─> Load/create FAISS indices (episodic.faiss.index, semantic.faiss.index)
               └─> Load vector ID mappings
           ↓
3. DAEMON RPC DISPATCH
   └─> sidecar_daemon.py POST /rpc
       ├─> JSONRPCProtocol.handle_request() - Validate and dispatch
       ├─> Route to registered method handler
       │   ├─> execute_tool - ToolRegistry.execute_tool()
       │   ├─> get_system_state - core.system_state.get_system_state()
       │   ├─> search_memory_by_embedding - LocalMemoryStore.search_by_embedding()
       │   └─> store_memory_by_embedding - LocalMemoryStore.add()
       └─> Return JSON-RPC response through daemon HTTP response
```

### Tool Execution Flow

```
1. JSON-RPC REQUEST
   └─> sidecar_daemon.py /rpc
       └─> LocalRuntimeService._handle_execute_tool()
           ↓
2. TOOL REGISTRY
   └─> tools/registry.py
       └─> ToolRegistry.execute_tool()
           ├─> Validate arguments using Pydantic (tools/schemas.py)
           ├─> Route to tool implementation
           └─> Convert result to ToolResult
           ↓
3. TOOL IMPLEMENTATION
   ├─> tools/computer/*.py - Computer control (mouse, keyboard, screenshot, scroll)
   ├─> tools/filesystem/*.py - Filesystem operations (read, replace)
   └─> tools/system/*.py - System operations (shell, stats, wait, windows)
       ↓
4. TOOL RESULT
   └─> tools/result.py
       └─> ToolResult.to_dict() - Convert to JSON-RPC response format
           └─> Return through SDK local-runtime daemon response
```

### Memory Storage Flow

```
1. MEMORY OPERATION
   └─> memory/local_store.py
       └─> LocalMemoryStore
           ↓
2. SDK-PROVIDED EMBEDDING
   └─> SDK calls backend /api/embeddings/
       └─> Sidecar receives content + embedding via store_memory_by_embedding
           ↓
3. STORAGE
   ├─> Episodic Memory
   │   ├─> episodic.db (SQLite) - Store metadata and content
   │   └─> episodic.faiss.index - Store embedding vectors
   │
   └─> Semantic Memory
       ├─> semantic.db (SQLite) - Store metadata and content
       └─> semantic.faiss.index - Store embedding vectors
           ↓
4. PERIODIC CONSOLIDATION
   └─> memory/summarizer.py
       ├─> Detect idle windows or batch thresholds
       ├─> Call backend /api/semantic/summarize
       ├─> Store semantic memory summary
       └─> Mark episodic memories as semanticized
           ↓
5. SEARCH
   └─> LocalMemoryStore.search_by_embedding()
       ├─> Receive query embedding from SDK
       ├─> Search FAISS indices (episodic + semantic)
       ├─> Retrieve metadata from SQLite
       └─> Return ranked results
```

### Wakeword Service Flow

```
1. ELECTRON MAIN PROCESS
   └─> Spawns Python subprocess (wakeword_service.py)
       └─> stdin (binary) / stdout (binary) for audio chunks
           ↓
2. INITIALIZATION
   └─> wakeword_service.py
       ├─> Ensure openWakeWord models downloaded
       └─> Initialize Model (TFLite or ONNX fallback)
           ↓
3. MAIN LOOP
   └─> Read audio chunks from stdin
       ├─> Read 4-byte length header
       ├─> Read audio data (16-bit PCM)
       ├─> Convert to numpy array
       ├─> Model.predict() - Get wakeword predictions
       ├─> Check threshold (0.5) for detection
       └─> Send JSON result to stdout (4-byte length + JSON)
```

### System State Collection Flow

```
1. REQUEST
   └─> local_backend.py
       └─> LocalRuntimeService._handle_get_system_state()
           ↓
2. PARALLEL COLLECTION
   └─> core/system_state.py
       └─> get_system_state()
           ├─> _get_active_window() - Platform-specific (win32gui/AppKit/xdotool)
           ├─> _get_mouse_position() - pyautogui.position()
           ├─> _get_clipboard_preview() - pyperclip.paste()
           ├─> get_screen_resolution() - pyautogui.size()
           ├─> _get_all_open_windows() - core.platform.window_manager.WindowManager
           └─> _get_system_stats() - psutil (CPU, memory, battery)
           ↓
3. AGGREGATION
   └─> Return combined system state dictionary
```

### Platform Abstraction Flow

```
1. TOOL REQUEST
   └─> tools/system/window_tool.py
       └─> switch_to_window() or get_open_windows()
           ↓
2. PLATFORM DETECTION
   └─> core/platform/window_manager.py
       ├─> Detect platform (Windows/macOS/Linux)
       └─> Import appropriate WindowManager
           ├─> Windows: WindowsWindowManager (win32gui)
           ├─> macOS: MacOSWindowManager (AppKit)
           └─> Linux: LinuxWindowManager (xdotool)
           ↓
3. PLATFORM-SPECIFIC IMPLEMENTATION
   └─> Execute window operations using platform APIs
```

---

## Key Design Principles

1. **Protocol Separation**: Two distinct local-runtime services with different protocols:
   - Python local runtime: JSON-RPC 2.0 (full-featured)
   - Wakeword Service: Binary protocol (audio chunks)

2. **Cross-Platform Support**: Platform abstraction layer for OS-specific operations (window management, system state)

3. **Async-First**: All I/O operations use asyncio with thread pool for blocking operations

4. **Type Safety**: Pydantic schemas for all tool arguments with validation

5. **Standardized Results**: ToolResult dataclass ensures consistent response format

6. **SDK-Owned Embeddings**: SDK uses backend embedding API and passes vectors to local-runtime storage/search

7. **Separate Memory Types**: Episodic and semantic memories stored in separate databases and FAISS indices

8. **Tool Registry Pattern**: Centralized tool registration and execution with validation

9. **Gitignore Integration**: Filesystem tools respect .gitignore patterns using pathspec

10. **Workspace Boundaries**: File operations validated against workspace root

11. **Thread Pool Reuse**: Global thread pool for blocking operations (FAISS, file I/O)

12. **Error Handling**: Graceful degradation when platform-specific libraries unavailable

13. **Binary Detection**: Automatic binary file detection to prevent reading binary as text

14. **Size Limits**: File size limits (10MB) and match limits (500) to prevent context window explosion

---

## Service Communication Patterns

### JSON-RPC 2.0 (Python Local Runtime)
- **Protocol**: JSON-RPC 2.0 envelopes over local runtime daemon HTTP `/rpc`
- **Methods**: execute_tool, get_system_state, search_memory_by_embedding, store_memory_by_embedding, ping, get_status
- **Error Handling**: Standard JSON-RPC error codes

### Binary Protocol (Wakeword Service)
- **Protocol**: Binary length-prefixed messages
- **Input**: 4-byte length (little-endian) + audio data (16-bit PCM)
- **Output**: 4-byte length (little-endian) + JSON result
- **Special**: Length 0 = reset command

---

## Dependencies

- **Vector Storage**: faiss-cpu, aiosqlite
- **HTTP Client**: aiohttp (for semantic summarization/title helpers)
- **Computer Control**: pyautogui, pynput
- **System Info**: psutil, pyperclip
- **Image Processing**: Pillow
- **Data Validation**: pydantic
- **Gitignore**: pathspec
- **Platform-Specific**: pywin32 (Windows), AppKit (macOS), xdotool (Linux)
- **Wakeword**: openwakeword
