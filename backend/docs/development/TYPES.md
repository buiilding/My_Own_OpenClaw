# Type System Conventions

**Purpose:** This document establishes clear conventions for when to use TypedDict vs Dataclass/Pydantic models in the codebase.

---

## Core Principle

**Use TypedDict only for external API boundaries. Use Dataclass/Pydantic for all internal data structures.**

---

## TypedDict: External API Boundaries Only

### When to Use TypedDict

Use `TypedDict` **only** for:
1. **LLM API Communication** - Messages sent to/received from LLM providers
2. **WebSocket Messages** - Messages sent to/received from frontend
3. **Serialization Boundaries** - Data structures that cross process boundaries

### Examples

```python
# ✅ CORRECT: LLM API boundary
class LLMMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: Union[str, MultimodalContent]

# ✅ CORRECT: WebSocket message boundary
class WebSocketMessage(TypedDict):
    type: str
    data: Dict[str, Any]
```

### Why TypedDict for External APIs?

- **No Runtime Validation:** TypedDict doesn't create runtime objects
- **JSON-Compatible:** Directly serializable to/from JSON
- **API Contracts:** Matches external API formats exactly

---

## Dataclass/Pydantic: Internal Data Structures

### When to Use Dataclass

Use `@dataclass` for:
1. **Internal Domain Objects** - Core business logic data structures
2. **Event Objects** - Event bus events (already using dataclasses)
3. **Configuration Objects** - AppConfig, etc.
4. **Result Objects** - ToolResult, ExecutionResult, etc.

### Examples

```python
# ✅ CORRECT: Internal domain object
@dataclass
class ToolResult:
    success: bool
    data: Any = None
    error: Optional[str] = None

# ✅ CORRECT: Event object
@dataclass
class ChunkEvent(StreamingEvent):
    content: str

# ✅ CORRECT: Configuration metadata
@dataclass
class PromptMetadata:
    system_prompt: str
    tool_schemas: Optional[Dict[str, Any]] = None
```

### Why Dataclass for Internal Structures?

- **Runtime Validation:** Can add validation logic
- **Type Safety:** IDE autocomplete and type checking
- **Extensibility:** Easy to add methods and properties
- **Composition:** Can nest and compose objects

---

## Pydantic: When You Need Validation

### When to Use Pydantic

Use Pydantic `BaseModel` when you need:
1. **Input Validation** - Validating user input or API requests
2. **Data Transformation** - Converting between formats
3. **Schema Generation** - Generating JSON schemas

### Examples

```python
# ✅ CORRECT: API request validation
class IncomingMessage(BaseModel):
    type: str
    content: str
    user_id: str

# ✅ CORRECT: Configuration with validation
class AppConfig(BaseModel):
    model_provider: str
    api_key: str
    
    @validator('api_key')
    def validate_api_key(cls, v):
        if not v:
            raise ValueError('API key required')
        return v
```

---

## Migration Guidelines

### Converting TypedDict to Dataclass

**Before (TypedDict):**
```python
class ToolResultDict(TypedDict, total=False):
    success: bool
    error: Optional[str]
    data: Any
```

**After (Dataclass):**
```python
@dataclass
class ToolResult:
    success: bool
    error: Optional[str] = None
    data: Any = None
```

### Converting Dictionary Access to Object Access

**Before:**
```python
result_dict = {"success": True, "error": None}
if result_dict.get("error"):
    handle_error(result_dict["error"])
```

**After:**
```python
result = ToolResult(success=True, error=None)
if result.error:
    handle_error(result.error)
```

---

## Current State

### ✅ Already Using Dataclass (Correct)

- `ToolResult` - Tool execution results
- `StreamingEvent` hierarchy - All event types
- `PromptMetadata` - Prompt construction metadata
- `StoredMessage` - Conversation history
- `ParsedToolCall` - Parsed tool calls
- `ToolExecutionResult` - Execution results

### ✅ Already Using TypedDict (Correct - External APIs)

- `LLMMessage` - LLM API format
- `MultimodalContent` - LLM API format
- `WebSocketMessage` - WebSocket protocol
- `StreamingChunk` - **DEPRECATED** (use StreamingEvent objects)

### ⚠️ Deprecated TypedDicts (Should Migrate)

- `ToolResultDict` - **DEPRECATED** - Use `ToolResult` dataclass
- `StreamingChunk` - **DEPRECATED** - Use `StreamingEvent` objects

---

## Decision Tree

```
Is this data crossing an external API boundary?
├─ YES → Use TypedDict
│   ├─ LLM API? → TypedDict
│   ├─ WebSocket? → TypedDict
│   └─ HTTP API? → TypedDict
│
└─ NO → Use Dataclass/Pydantic
    ├─ Need validation? → Pydantic BaseModel
    └─ No validation needed? → @dataclass
```

---

## Best Practices

1. **Never Mix Formats:** Don't convert between TypedDict and Dataclass unnecessarily
2. **Single Conversion Point:** Convert at API boundaries only
3. **Type Hints:** Always use type hints, even for TypedDict
4. **Documentation:** Document why TypedDict is used (external API requirement)

---

## Examples of Anti-Patterns

### ❌ BAD: Using TypedDict for internal structures

```python
# DON'T DO THIS
class InternalConfig(TypedDict):
    setting: str
    value: int

# DO THIS INSTEAD
@dataclass
class InternalConfig:
    setting: str
    value: int
```

### ❌ BAD: Manual dictionary field extraction

```python
# DON'T DO THIS
metadata = prompt_metadata.get("tool_schemas")
if metadata:
    use_metadata(metadata["system_prompt"])

# DO THIS INSTEAD
if prompt_metadata.tool_schemas:
    use_metadata(prompt_metadata.system_prompt)
```

### ❌ BAD: String-based type checking

```python
# DON'T DO THIS
if event.get("type") == "chunk":
    content = event.get("content")

# DO THIS INSTEAD
if isinstance(event, ChunkEvent):
    content = event.content
```

---

## Summary

- **TypedDict** = External API boundaries only
- **Dataclass** = Internal data structures (default choice)
- **Pydantic** = When you need validation
- **Never** use string-based type checking or manual dictionary access for internal structures

