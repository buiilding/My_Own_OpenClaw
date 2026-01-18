# Memory System

## Overview

The memory system provides **episodic** and **semantic** memory capabilities. The backend **coordinates** memory queries, while the frontend **stores** memories locally.

## Architecture

### Backend Responsibilities

- **Memory Coordination**: Queries frontend for relevant memories
- **Memory Integration**: Integrates memories into conversation context
- **Embedding Generation**: Generates embeddings for semantic search (if needed)

### Frontend Responsibilities

- **Memory Storage**: Stores episodic and semantic memories locally
- **Memory Retrieval**: Retrieves relevant memories based on queries
- **Vector Storage**: Manages vector embeddings for semantic search

## Memory Types

### Episodic Memory

**Stores**: Conversation history, tool executions, user interactions

**Format**: Structured messages with timestamps

**Retrieval**: Time-based or keyword-based

### Semantic Memory

**Stores**: Vector embeddings of important information, user preferences, learned facts

**Format**: FAISS vector store with metadata

**Retrieval**: Semantic similarity search

**Activation**: Semantic memory is **automatically generated** from episodic memories using a **sequential, conversation-window-based approach**. This ensures temporal coherence and preserves narrative flow.

**Key Principles**:
- **Sequential Processing**: Memories are summarized in chronological order within each conversation window
- **Conversation Windows**: Each session/conversation is tracked separately via `conversation_id`
- **No Random Sampling**: All unsummarized memories from the same conversation are processed together, maintaining context
- **Periodic Summarization**: Long conversations are summarized incrementally to prevent token overflow

Semantic memory can also be stored manually via the `memory` tool.

## Memory Flow

### Storing Memories

#### Automatic Episodic Memory Storage

```
1. Backend completes assistant response
   ↓
2. Backend sends memory-store event (type: "episodic") with session_id to frontend
   ↓
3. Frontend receives event via WebSocket
   ↓
4. Frontend sends memory_store_request to Python sidecar (includes session_id)
   ↓
5. Python sidecar stores memory in SQLite + FAISS with conversation_id
   ↓
6. FAISS index saved immediately after each addition
   ↓
7. If conversation has 20+ unsummarized messages, trigger periodic summarization
```

**Note**: Currently, only episodic memory is automatically stored after each interaction.

#### Manual Semantic Memory Storage

Semantic memory can be stored manually via the `memory` tool:

```
1. LLM determines important information should be preserved
   ↓
2. LLM calls memory tool with memory_type="semantic"
   ↓
3. Tool stores semantic memory in SQLite + FAISS
   ↓
4. FAISS index saved immediately after each addition
```

**Use Cases for Semantic Memory**:
- User preferences (e.g., "I prefer dark mode")
- Learned facts (e.g., "User's name is John")
- Important context (e.g., "User works as a software engineer")
- Long-term information that should persist across sessions

**Storage Location**: `~/.local/share/desktop-assistant/memory/`
- `episodic.db`: SQLite database for episodic memories
  - Schema includes: `id`, `user_id`, `content`, `timestamp`, `metadata`, `embedding_id`, `created_at`, `is_semanticized`, `conversation_id`
  - `conversation_id`: Groups memories by conversation window (session)
  - `is_semanticized`: Tracks whether memory has been processed (0 = unprocessed, 1 = processed)
- `episodic.faiss.index`: FAISS vector index for episodic memories
- `semantic.db`: SQLite database for semantic memories
- `semantic.faiss.index`: FAISS vector index for semantic memories

**Persistence**: FAISS indices are saved immediately after each memory addition to ensure persistence across restarts.

### Retrieving Memories

```
1. User sends query
   ↓
2. Frontend main process sends memory_search_request to sidecar
   ↓
3. Python sidecar performs semantic similarity search
   ↓
4. Sidecar returns memories grouped by type
   ↓
5. Frontend formats memories into XML sections
   ↓
6. Memories included in query message to backend
```

**Search Process**:
1. Query text is embedded using remote embedding client
2. FAISS index searched for similar vectors
3. Results filtered by user_id and metadata
4. Results sorted by similarity score
5. Top N results returned (default: 5)

**Index Rebuild**: If FAISS index is empty but memories exist in database, the index is automatically rebuilt from database contents during initialization.

### Semantic Memory Generation

**Sequential, Conversation-Window-Based Summarization**:

The system uses a sophisticated approach that maintains temporal coherence:

#### 1. Startup Safety Net (Primary Recovery Mechanism)

```
1. App starts up
   ↓
2. Python sidecar initializes memory store
   ↓
3. Background task identifies conversation windows with unsummarized memories
   ↓
4. For each conversation window (processed one at a time):
   a. Get all unsummarized memories in chronological order
   b. Send entire conversation window to backend LLM for summarization
   c. LLM extracts facts, preferences, and important context
   d. Facts stored as semantic memories
   e. Episodic memories marked as processed
   ↓
5. Process repeats for next conversation window
```

**Why Sequential Per Window?**
- **Temporal Coherence**: Processing memories in chronological order preserves narrative flow
- **Context Preservation**: The LLM sees the full conversation history, not fragmented pieces
- **No Random Sampling**: All memories from the same conversation are processed together
- **Reliability**: If one window fails, others continue processing

#### 2. Periodic Summarization (During Long Conversations)

For conversations that exceed 20 unsummarized messages:

```
1. User interaction completes and memory is stored
   ↓
2. System checks: conversation has 20+ unsummarized messages?
   ↓
3. If yes, trigger background summarization:
   a. Get oldest 20 unsummarized messages (chronological order)
   b. Summarize this chunk
   c. Store facts as semantic memories
   d. Mark chunk as semanticized
   ↓
4. Remaining unsummarized messages continue accumulating
   ↓
5. Process repeats when threshold reached again
```

**Benefits**:
- Prevents token overflow in very long conversations
- Maintains conversation context through rolling summarization
- Non-blocking: happens in background, doesn't delay user interactions
- **Full history preserved**: Original episodic memories remain searchable even after summarization
  - The `is_semanticized` flag only marks processing status, not visibility
  - Users can still access complete conversation history via memory search

**What Gets Extracted**:
- User preferences (e.g., "I prefer dark mode")
- Key facts about the user (e.g., "User works as a software engineer")
- Important context (e.g., "User is learning machine learning")

**Database Tracking**:
- Episodic memories have an `is_semanticized` flag (0 = unprocessed, 1 = processed)
  - **Important**: This flag only tracks processing status, NOT visibility
  - Semanticized memories remain in the database and are still searchable
  - The flag prevents duplicate summarization, not memory access
- Episodic memories have a `conversation_id` column to group by conversation window
- This ensures idempotency: same memories won't be processed twice
- Failed windows remain unprocessed for retry on next startup
- Each conversation window is processed independently (one at a time)

**API Endpoint**: `/api/semantic/summarize`
- Accepts list of conversation texts
- Returns structured summary and extracted facts
- Used by frontend sidecar during startup processing

## Memory Integration

### Query Processing

**Location**: `frontend/src/main/ipc.cjs`

When processing a query:

1. Frontend sends `memory_search_request` to Python sidecar
2. Sidecar performs semantic search and returns results
3. Frontend formats memories into XML sections
4. Memories included in query message sent to backend
5. Backend receives memories in query content
6. LLM uses memories for context-aware responses

### Memory Search Response Format

**Python Sidecar Response**:
```json
{
  "id": "memory-request-id",
  "type": "response",
  "payload": {
    "success": true,
    "data": {
      "memories": {
        "episodic": [
          "User: hi\nAssistant: Hello! How can I help you today?",
          "User: how u doing\nAssistant: As an AI, I don't have feelings..."
        ],
        "semantic": []
      }
    }
  }
}
```

**Frontend Processing**:
- Extracts `payload.data.memories`
- Formats episodic memories as bullet list
- Formats semantic memories as bullet list
- Includes in query message as XML sections

### Memory Format in Query

Memories are included in the query payload as XML:

```xml
<episodic_memory>
- User: hi
Assistant: Hello! How can I help you today?
- User: how u doing
Assistant: As an AI, I don't have feelings...
</episodic_memory>

<semantic_memory>
None
</semantic_memory>

<user_query>
User's current query
</user_query>
```

## Embedding Generation

**Location**: `backend/src/memory/` (if implemented)

If backend generates embeddings:

- Uses embedding provider (OpenAI, local, etc.)
- Generates embeddings for semantic search
- Sends embeddings to frontend for storage

**Note**: Currently, embeddings may be generated on frontend sidecar.

## Memory Coordination

### Frontend Communication

**Memory Search Request** (Main Process → Python Sidecar):
```json
{
  "id": "memory-request-id",
  "type": "memory_search_request",
  "payload": {
    "query": "User query text",
    "limit": 5
  }
}
```

**Memory Search Response** (Python Sidecar → Main Process):
```json
{
  "id": "memory-request-id",
  "type": "response",
  "payload": {
    "success": true,
    "data": {
      "memories": {
        "episodic": ["memory text 1", "memory text 2"],
        "semantic": []
      }
    }
  }
}
```

**Note**: The response structure uses `payload.data.memories`, not `payload.memories`.

### Memory Context

Memories are integrated into query message as XML sections:

```xml
<episodic_memory>
- User: previous query
Assistant: previous response
- User: another query
Assistant: another response
</episodic_memory>

<semantic_memory>
None
</semantic_memory>
```

### FAISS Index Management

**Persistence**:
- FAISS indices are saved immediately after each memory addition
- Ensures indices are always up-to-date and persist across restarts
- Indices saved to: `~/.local/share/desktop-assistant/memory/*.faiss.index`

**Rebuild Logic**:
- On initialization, if FAISS index is empty but memories exist in database
- Index is automatically rebuilt by:
  1. Loading all memories from database
  2. Generating embeddings for each memory
  3. Adding embeddings to FAISS index
  4. Saving index to disk

**Vector Mappings**:
- Maintains bidirectional mapping between memory IDs and vector IDs
- Stored in database (`embedding_id` column)
- Loaded into memory on initialization
- Synced after each memory addition

## Best Practices

1. **Relevance**: Only retrieve relevant memories
2. **Limit**: Limit number of memories to avoid context overflow
3. **Integration**: Integrate memories naturally into context
4. **Storage**: Let frontend handle storage details
5. **Coordination**: Backend coordinates, frontend stores
6. **Temporal Order**: Always process memories in chronological order within conversation windows
7. **Conversation Isolation**: Process each conversation window independently to maintain context

## Important Notes

1. **No Local Storage**: Backend does not store memories locally
2. **Coordination Only**: Backend coordinates memory queries
3. **Frontend Storage**: All memory storage happens on frontend
4. **Semantic Search**: Semantic search happens on frontend
5. **Vector Store**: Vector embeddings managed by frontend
