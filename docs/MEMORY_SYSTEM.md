# Memory System

## Overview

The Memory System provides comprehensive memory capabilities for Desktop Assistant, enabling persistent context, semantic search, and intelligent information retrieval across conversations.

> **Note**: For detailed memory system documentation, see the [Memory System README](../backend/src/memory/README.md) in the backend source code.

## Quick Reference

### Key Features

- **Episodic Memory**: Records of user interactions and agent actions
- **Semantic Memory**: Vector-based storage for meaning-based retrieval
- **Working Memory**: Current conversation context and state
- **Declarative Memory**: Factual knowledge and learned information

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Memory        │    │   Vector        │    │   Storage       │
│   Manager       │◄──►│   Embeddings    │◄──►│   Backend       │
│                 │    │                 │    │                 │
│ • Query         │    │ • Text to       │    │ • SQLite        │
│ • Store         │    │   Vectors       │    │ • FAISS         │
│ • Retrieve      │    │ • Similarity    │    │ • File-based    │
│ • Maintenance   │    │ • Caching       │    │ • Async I/O     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Configuration

```yaml
memory:
  enabled: true
  storage_type: "sqlite"  # sqlite, faiss, hybrid
  max_history_length: 1000
  embedding_model: "sentence-transformers/all-MiniLM-L6-v2"
  similarity_threshold: 0.7
  cleanup_interval_hours: 24
  max_memory_items: 50000

embeddings:
  model_name: "sentence-transformers/all-MiniLM-L6-v2"
  device: "cuda"  # cuda or cpu
  cache_size: 1000
  batch_size: 32
```

### Usage

```python
from backend.src.memory import MemoryManager

# Initialize memory system
memory = MemoryManager()

# Store an interaction
await memory.store_interaction(Interaction(...))

# Retrieve relevant memories
relevant = await memory.retrieve_relevant(
    query="weather information",
    limit=5
)

# Search for similar content
similar = await memory.search_similar(
    text="Tell me about the forecast",
    threshold=0.8
)
```

## Components

### Memory Manager

Central orchestrator for all memory operations.

**Key Methods**:
- `store_interaction()`: Store user-agent interaction
- `retrieve_relevant()`: Get semantically relevant memories
- `search_similar()`: Vector similarity search
- `cleanup_old_entries()`: Remove old entries

### Embeddings Service

Converts text to vector representations using sentence transformers.

**Key Methods**:
- `encode_text()`: Encode single text
- `encode_batch()`: Encode multiple texts
- `similarity()`: Calculate similarity

### Storage Backend

Multiple storage options:

- **SQLite**: Primary storage for conversation history
- **FAISS**: High-performance vector similarity search
- **Hybrid**: Combines both for optimal performance

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

### MemoryManager Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `store_interaction()` | Store user-agent interaction | `interaction: Interaction` | `None` |
| `retrieve_relevant()` | Get semantically relevant memories | `query: str, limit: int` | `List[MemoryItem]` |
| `search_similar()` | Vector similarity search | `text: str, threshold: float` | `List[MemoryItem]` |
| `cleanup_old_entries()` | Remove old memory entries | `older_than_days: int` | `int` (deleted count) |
| `health_check()` | System health status | - | `Dict[str, Any]` |

## Further Reading

For complete documentation, see:
- [Memory System README](../backend/src/memory/README.md) - Complete memory system documentation
- [Configuration Guide](CONFIGURATION.md) - Memory configuration options
- [Backend Architecture](BACKEND_ARCHITECTURE.md) - System architecture details

---

The memory system provides the foundation for persistent, intelligent context management in Desktop Assistant, enabling truly personalized and continuity-aware interactions.
