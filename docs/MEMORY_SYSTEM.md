# Memory System

## Overview

The Memory System provides comprehensive memory capabilities for Desktop Assistant, enabling persistent context, semantic search, and intelligent information retrieval across conversations.

**Architecture Note**: The memory system is split between frontend and backend:
- **Backend**: Provides embedding generation service (REST API)
- **Frontend**: Handles storage, retrieval, and schema management (Python sidecar with SQLite + FAISS)

## Quick Reference

### Key Features

- **Episodic Memory**: Records of user interactions and agent actions (stored in frontend)
- **Semantic Memory**: Vector-based storage for meaning-based retrieval (stored in frontend)
- **Working Memory**: Current conversation context and state (managed by AgentSession)
- **Embedding Service**: Backend provides embeddings via REST API for frontend memory system

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Python Sidecar)                │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Local Memory  │    │   Vector        │                │
│  │   Store         │◄──►│   Storage       │                │
│  │                 │    │                 │                │
│  │ • SQLite        │    │ • FAISS         │                │
│  │ • Episodic      │    │ • Similarity    │                │
│  │ • Semantic      │    │ • Search        │                │
│  └─────────────────┘    └─────────────────┘                │
│              ↕ HTTP REST API                                 │
└─────────────────────────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                       │
│  ┌─────────────────┐                                       │
│  │   Embeddings    │                                       │
│  │   Service       │                                       │
│  │                 │                                       │
│  │ • Sentence      │                                       │
│  │   Transformers  │                                       │
│  │ • Text to       │                                       │
│  │   Vectors       │                                       │
│  │ • Caching       │                                       │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

#### Backend Configuration

Backend embedding service configuration:

```python
# backend/src/core/config/models.py
embeddings:
  model_name: "sentence-transformers/all-MiniLM-L6-v2"  # Default model
  device: "cuda"  # or "cpu"
  cache_size: 1000  # Managed by CacheManager
  batch_size: 32
```

#### Frontend Configuration

Frontend memory store configuration (Python sidecar):

```python
# Frontend memory store uses SQLite + FAISS
# Configuration managed in local_store.py
# Database path: User data directory
# FAISS index: Stored alongside SQLite database
```

### Usage

#### Backend: Embedding Generation

The backend provides a REST API for embedding generation:

```python
# Frontend calls: POST /api/embeddings/
{
    "text": "User preference: prefers dark mode",
    "model_name": "default"
}

# Response:
{
    "embedding": [0.123, 0.456, ...],
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "dimension": 384
}
```

#### Frontend: Memory Storage and Retrieval

The frontend Python sidecar handles all memory operations:

```python
# Frontend Python sidecar (local_store.py)
from memory.local_store import LocalMemoryStore

# Initialize memory store
memory_store = LocalMemoryStore()

# Add episodic memory (calls backend for embedding)
await memory_store.add_episodic(
    content="User asked about weather",
    metadata={"timestamp": "2026-01-24"}
)

# Add semantic memory
await memory_store.add_semantic(
    content="User prefers dark mode",
    metadata={"type": "preference"}
)

# Search memories
results = await memory_store.search(
    query="user preferences",
    limit=5
)
```

## Components

### Backend: Embeddings Service (`backend/src/memory/embeddings.py`)

The backend provides embedding generation via REST API. The actual implementation uses `SentenceTransformerProvider`.

**Responsibilities**:
- Generate embeddings for text using SentenceTransformers
- Provide REST API endpoint (`/api/embeddings/`)
- Cache embeddings to avoid recomputation
- Support GPU/CPU execution

**Key Methods**:
- `embed_text()`: Generate embedding for single text
- `embed_batch()`: Generate embeddings for multiple texts (batch processing)

**Implementation Details**:
- **Model**: Uses SentenceTransformers (default: `all-MiniLM-L6-v2`)
- **Device**: Supports CPU and CUDA (GPU)
- **Caching**: Integrates with CacheManager to cache embeddings
- **Thread Safety**: Model loading protected with asyncio.Lock
- **Async**: All blocking operations offloaded to thread pool

**REST API**:
- `POST /api/embeddings/`: Generate embedding for text
- `GET /api/embeddings/health`: Health check

### Frontend: Local Memory Store (`frontend/src/main/python/memory/local_store.py`)

The frontend Python sidecar handles all memory storage and retrieval.

**Responsibilities**:
- Store episodic and semantic memories locally
- Perform vector similarity search using FAISS
- Manage SQLite database for metadata
- Call backend embedding API for vector generation

**Key Methods**:
- `add_episodic()`: Store episodic memory
- `add_semantic()`: Store semantic memory
- `search()`: Search memories by similarity
- `stats()`: Get memory statistics

**Storage**:
- **SQLite**: Stores metadata and episodic memories
- **FAISS**: Vector index for semantic search
- **Remote Embedding Client**: Calls backend `/api/embeddings/` endpoint

## Integration

### Agent System Integration

- Agents automatically retrieve relevant memories
- Successful patterns stored for future use
- User preferences and behavior patterns tracked

### Tool System Integration

- Tools access conversation history
- Tool results cached in memory
- Tools improve based on past performance

## Performance

### Optimization Strategies

- **Caching**: Embedding cache, query cache, result cache
- **Storage Optimization**: Index optimization, compression, partitioning
- **Retrieval Optimization**: Approximate search, pre-filtering, batch processing

### GPU Acceleration

- **CUDA Support**: GPU-accelerated embeddings
- **Batch Processing**: Efficient batch encoding
- **Performance**: Significant speedup with GPU

## Privacy & Security

### Data Protection

- **Encryption**: Sensitive metadata encrypted at rest
- **Access Control**: Memory access restricted by user permissions
- **Data Isolation**: User memories completely isolated

### Privacy Features

- **Opt-in Storage**: Users can disable memory storage
- **Data Export**: Users can export their memory data
- **Data Deletion**: Complete memory wipe functionality
- **Audit Logging**: Memory access is logged for transparency

## Troubleshooting

### Common Issues

**High Memory Usage**:
- Cleanup old entries
- Reduce max_memory_items
- Optimize storage

**Slow Retrieval**:
- Enable GPU acceleration
- Rebuild FAISS index
- Reduce search scope

**Embedding Errors**:
- Verify embedding model
- Check GPU availability
- Verify model configuration

## API Reference

### Backend Embeddings API

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/embeddings/` | POST | Generate embedding | `{"text": str, "model_name": str}` | `{"embedding": List[float], "model_name": str, "dimension": int}` |
| `/api/embeddings/health` | GET | Health check | - | `{"status": str, "model_name": str, "dimension": int}` |

### Frontend Memory Store (Python Sidecar)

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `add_episodic()` | Store episodic memory | `content: str, metadata: dict` | `None` |
| `add_semantic()` | Store semantic memory | `content: str, metadata: dict` | `None` |
| `search()` | Search memories | `query: str, limit: int` | `List[dict]` |
| `stats()` | Get statistics | - | `dict` |

### Backend Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model_name` | str | `"all-MiniLM-L6-v2"` | Sentence transformer model |
| `device` | str | `"cpu"` | Device for model execution ("cpu" or "cuda") |
| `cache_size` | int | `1000` | Embedding cache size (managed by CacheManager) |
| `batch_size` | int | `32` | Batch size for batch encoding |

## Further Reading

For complete documentation, see:
- [Python Sidecar Documentation](PYTHON_SIDECAR.md) - Frontend memory operations
- [API Reference](API_REFERENCE.md) - Embeddings API endpoints
- [Backend Architecture](BACKEND_ARCHITECTURE.md) - System architecture details

---

**Note**: The backend's role in memory is primarily limited to embedding generation. Storage, retrieval, and schema management are handled by the frontend Python sidecar. See [Python Sidecar Documentation](PYTHON_SIDECAR.md) for details on frontend memory operations.
