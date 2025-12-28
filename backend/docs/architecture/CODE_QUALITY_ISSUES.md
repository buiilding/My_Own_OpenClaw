# Code Quality Issues: Brittle Implementations

This document identifies brittle, unintuitive, or maintainability-problematic implementations in the codebase that rely on string comparisons, manual data flow tracking, or workarounds instead of operating on root objects or authoritative data structures.

## 1. String-Based Role Checking

### Problem
**Location**: `backend/src/llm/prompt_constructor.py:133,155`, `backend/src/agent/state.py:114`

**Issue**: Message roles are checked using string literals (`"user"`, `"assistant"`, `"system"`) throughout the codebase. This is brittle because:
- Typos are not caught at compile time
- Refactoring role names requires searching the entire codebase
- No type safety or IDE autocomplete support
- Easy to introduce inconsistencies (e.g., `"User"` vs `"user"`)

**Example**:
```python
if msg["role"] == "user":
    # Process user message
```

### Solution
Create a `MessageRole` enum and use it consistently:

```python
from enum import Enum

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"  # For tool outputs

# Usage
if msg["role"] == MessageRole.USER:
    # Process user message
```

**Benefits**:
- Type safety and IDE autocomplete
- Single source of truth
- Refactoring-safe (rename enum value once)
- Can add validation in `LLMMessage` type

---

## 2. String-Based Event Type Handling

### Problem
**Location**: `backend/src/api/handlers/response_formatter.py:28-101`

**Issue**: Event types are handled via a long if/elif chain with string comparisons. This violates the Open/Closed Principle and is error-prone:
- Adding new event types requires modifying the formatter
- No compile-time checking for missing handlers
- String typos cause silent failures
- Difficult to test exhaustively

**Example**:
```python
event_type = event.get("type")
if event_type == "thinking":
    return {...}
elif event_type == "chunk":
    return {...}
elif event_type == "error":
    return {...}
# ... 8 more elif blocks
```

### Solution
Use a strategy pattern with a registry:

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class EventFormatter(ABC):
    @abstractmethod
    def format(self, event: Dict[str, Any], msg_id: str) -> Optional[Dict[str, Any]]:
        pass

class ThinkingEventFormatter(EventFormatter):
    def format(self, event: Dict[str, Any], msg_id: str) -> Optional[Dict[str, Any]]:
        return {
            "type": "llm-thought",
            "id": msg_id,
            "payload": {"status": event["content"]},
        }

class ResponseFormatter:
    def __init__(self):
        self._formatters: Dict[str, EventFormatter] = {
            "thinking": ThinkingEventFormatter(),
            "chunk": ChunkEventFormatter(),
            # ... register all formatters
        }
    
    def format(self, event: Dict[str, Any], msg_id: str) -> Optional[Dict[str, Any]]:
        event_type = event.get("type")
        formatter = self._formatters.get(event_type)
        if formatter:
            return formatter.format(event, msg_id)
        return None
```

**Benefits**:
- Open/Closed: Add new formatters without modifying existing code
- Type-safe event type handling
- Easy to test individual formatters
- Can use enums for event types

---

## 3. XML Parsing with Regex

### Problem
**Location**: `backend/src/llm/prompt_constructor.py:163,178,170-171`

**Issue**: XML-like tags (`<user_query>`, `<episodic_memory>`, `<semantic_memory>`) are parsed using regex instead of proper XML parsing. This is brittle because:
- Regex can fail on nested tags or special characters
- No validation of well-formed XML
- Hard to maintain as structure evolves
- Fragile to whitespace/formatting changes

**Example**:
```python
user_query_match = re.search(r'<user_query>(.*?)</user_query>', original_content, re.DOTALL)
if user_query_match:
    original_text = user_query_match.group(1).strip()
```

### Solution
Use a proper XML/HTML parser or structured message format:

**Option A: Use XML Parser**
```python
from xml.etree.ElementTree import fromstring, ElementTree

def extract_user_query(content: str) -> Optional[str]:
    try:
        # Wrap in root element if needed
        root = fromstring(f"<root>{content}</root>")
        user_query_elem = root.find("user_query")
        return user_query_elem.text if user_query_elem is not None else None
    except Exception:
        return None
```

**Option B: Use Structured Message Objects (Better)**
```python
@dataclass
class UserMessage:
    episodic_memory: List[str]
    semantic_memory: List[str]
    user_query: str
    system_context: Optional[str] = None
    
    @classmethod
    def from_string(cls, content: str) -> "UserMessage":
        # Parse once, use structured object everywhere
        ...
```

**Benefits**:
- Robust parsing that handles edge cases
- Validation of structure
- Type-safe access to message parts
- Easier to evolve message format

---

## 4. Hardcoded Tool Name Strings

### Problem
**Location**: Multiple files:
- `backend/src/core/security/policy.py:94-101` - Permission mappings
- `backend/src/agent/plugins/computer.py:25-29` - Computer control tools set
- Various tool name comparisons throughout

**Issue**: Tool names are hardcoded as strings in multiple places, creating maintenance burden:
- Tool name changes require updates in multiple files
- No single source of truth
- Typos cause runtime failures
- Difficult to track which tools exist

**Example**:
```python
builtin_permissions = {
    "write_file": {Permission.WRITE_FILESYSTEM},
    "read_file": {Permission.READ_FILESYSTEM},
    "run_shell_command": {Permission.EXECUTE_COMMANDS},
    # ... more hardcoded strings
}

COMPUTER_CONTROL_TOOLS: Set[str] = {
    "mouse_control",
    "keyboard_control",
    "scroll_control",
}
```

### Solution
Use tool metadata/registry as source of truth:

```python
# In Tool base class or registry
class Tool(ABC):
    name: str
    required_permissions: Set[Permission] = set()
    category: ToolCategory = ToolCategory.GENERAL
    
    @property
    def is_computer_control(self) -> bool:
        return self.category == ToolCategory.COMPUTER_CONTROL

# In SecurityPolicy
def check_permission(self, tool_name: str, permission: Permission, ...):
    tool = self.tool_registry.get_tool(tool_name)
    if not tool:
        return False
    
    required = tool.required_permissions
    # Use tool's declared permissions instead of hardcoded dict
```

**Benefits**:
- Single source of truth (tool registry)
- Tool declares its own permissions/category
- Type-safe tool access
- Easy to add new tools without updating multiple files

---

## 5. Manual Message Type Detection via String Tag Checking

### Problem
**Location**: `backend/src/llm/prompt_constructor.py:137-148`

**Issue**: Distinguishing user queries from tool outputs by checking for `<user_query>` tag presence in string content. This is fragile:
- Relies on string formatting that could change
- No type information to distinguish message types
- Requires parsing content to determine message type
- Easy to break if tag format changes

**Example**:
```python
if isinstance(content, str):
    has_user_query_tag = "<user_query>" in content
elif isinstance(content, list):
    text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"]
    full_text = " ".join(text_parts)
    has_user_query_tag = "<user_query>" in full_text
```

### Solution
Add explicit message type/metadata:

```python
@dataclass
class HistoryMessage:
    role: MessageRole
    content: str
    message_type: MessageType  # USER_QUERY, TOOL_OUTPUT, ASSISTANT_RESPONSE
    image_data: Optional[str] = None

class MessageType(str, Enum):
    USER_QUERY = "user_query"
    TOOL_OUTPUT = "tool_output"
    ASSISTANT_RESPONSE = "assistant_response"

# Usage
if msg.message_type == MessageType.USER_QUERY:
    # Process user query
```

**Benefits**:
- Explicit type information, no parsing needed
- Type-safe message handling
- Clear distinction between message types
- No reliance on string content format

---

## 6. Repeated Multimodal Content Type Checking

### Problem
**Location**: `backend/src/llm/prompt_constructor.py:139,175,197,220` (and likely more)

**Issue**: The pattern `part.get("type") == "text"` is repeated throughout the codebase to extract text from multimodal content. This is:
- Error-prone (typos in `"text"` string)
- Not DRY (repeated logic)
- Hard to refactor if content structure changes

**Example**:
```python
text_parts = [part.get("text", "") for part in content 
              if isinstance(part, dict) and part.get("type") == "text"]
```

### Solution
Create helper functions/classes:

```python
class MultimodalContent:
    """Wrapper for multimodal content with type-safe access."""
    
    def __init__(self, content: Union[str, List[Dict[str, Any]]]):
        self._content = content
    
    def get_text(self) -> str:
        if isinstance(self._content, str):
            return self._content
        elif isinstance(self._content, list):
            text_parts = [
                part.get("text", "") 
                for part in self._content 
                if isinstance(part, dict) and part.get("type") == ContentType.TEXT.value
            ]
            return " ".join(text_parts)
        return str(self._content)
    
    def has_image(self) -> bool:
        # Similar helper for images
        ...

# Usage
content = MultimodalContent(msg["content"])
text = content.get_text()
```

**Benefits**:
- Single implementation of extraction logic
- Type-safe content access
- Easy to extend for new content types
- Centralized handling of edge cases

---

## 7. Conversation History Internal Format Mismatch

### Problem
**Location**: `backend/src/agent/state.py`

**Issue**: `ConversationHistory` stores messages in an internal format (`Dict` with `"role"`, `"message"`, `"image_data"`), then converts to `LLMMessage` format on retrieval. This creates:
- Two representations of the same data
- Conversion overhead on every access
- Potential for inconsistencies
- No type safety on internal format

**Example**:
```python
# Internal format
self.history: List[Dict[str, Union[str, Optional[str]]]] = []

# Converted format
llm_messages: List[LLMMessage] = []
for msg in self.history:
    role = msg["role"]  # String access, no type safety
    message_text = msg["message"]
    # ... conversion logic
```

### Solution
Store messages in canonical format from the start:

```python
@dataclass
class StoredMessage:
    role: MessageRole
    content: Union[str, MultimodalContent]
    message_type: MessageType
    timestamp: float = field(default_factory=time.time)
    image_data: Optional[str] = None

class ConversationHistory:
    def __init__(self, max_length: int = 10):
        self.history: List[StoredMessage] = []
        self.max_length = max_length
    
    def get_history(self) -> List[LLMMessage]:
        # Simple conversion, no complex logic needed
        return [msg.to_llm_message() for msg in self.history]
```

**Benefits**:
- Single canonical format
- Type safety throughout
- No conversion overhead
- Clear message structure

---

## 8. Event Type String Literals

### Problem
**Location**: `backend/src/agent/interaction_loop.py:88,156,160`, `backend/src/api/handlers/response_formatter.py`

**Issue**: Event types are strings (`"thinking"`, `"chunk"`, `"error"`, etc.) checked throughout the codebase. This creates the same problems as role checking.

### Solution
Create `StreamingEventType` enum:

```python
class StreamingEventType(str, Enum):
    THINKING = "thinking"
    CHUNK = "chunk"
    ERROR = "error"
    STREAMING_COMPLETE = "streaming-complete"
    TOOL_CALL = "tool_call"
    TOOL_OUTPUT = "tool_output"
    SYSTEM_PROMPT = "system_prompt"
    USER_MESSAGE_FULL = "user_message_full"
    ASSISTANT_MESSAGE_FULL = "assistant_message_full"

# Usage
if event["type"] == StreamingEventType.THINKING:
    # Handle thinking event
```

---

## Summary of Recommended Changes

1. **Create Enums**: `MessageRole`, `MessageType`, `StreamingEventType`, `ContentType`
2. **Use Strategy Pattern**: For event formatting instead of if/elif chains
3. **Structured Message Objects**: Replace string-based XML parsing with typed objects
4. **Tool Metadata**: Move tool permissions/categories to tool definitions
5. **MultimodalContent Helper**: Centralize content extraction logic
6. **Canonical Message Format**: Store messages in structured format from creation

These changes will significantly improve:
- **Type Safety**: Catch errors at development time
- **Maintainability**: Single source of truth for each concept
- **Refactoring Safety**: Changes propagate automatically
- **Testability**: Easier to mock and test structured objects
- **Documentation**: Types serve as inline documentation

