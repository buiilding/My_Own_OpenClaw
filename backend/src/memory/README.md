# Memory System

The Memory System provides comprehensive memory capabilities for the Personal Assistant, enabling persistent context, semantic search, and intelligent information retrieval across conversations.

## Overview

The memory system consists of multiple integrated components that work together to provide:

- **Episodic Memory**: Records of user interactions and agent actions
- **Semantic Memory**: Vector-based storage for meaning-based retrieval
- **Working Memory**: Current conversation context and state
- **Declarative Memory**: Factual knowledge and learned information

## Architecture

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

## Components

### Memory Manager (`memory_manager.py`)

Central orchestrator for all memory operations:

```python
class MemoryManager:
    async def store_interaction(self, interaction: Interaction) -> None:
        """Store a user-agent interaction in memory."""

    async def retrieve_relevant(self, query: str, limit: int = 5) -> List[MemoryItem]:
        """Retrieve semantically relevant memories."""

    async def search_similar(self, text: str, threshold: float = 0.7) -> List[MemoryItem]:
        """Search for similar content using vector similarity."""
```

### Embeddings Service (`embeddings.py`)

Converts text to vector representations using sentence transformers:

```python
class EmbeddingsService:
    async def encode_text(self, text: str) -> List[float]:
        """Convert text to vector embeddings."""

    async def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """Batch encode multiple texts."""

    async def similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between vectors."""
```

### Storage Backend (`storage/`)

Multiple storage options for different use cases:

#### SQLite Vector Storage (`sqlite_storage.py`)
- **Purpose**: Primary storage for conversation history and metadata
- **Features**: ACID transactions, full-text search, relational queries
- **Performance**: Optimized for frequent reads/writes

#### FAISS Storage (`faiss_storage.py`)
- **Purpose**: High-performance vector similarity search
- **Features**: GPU acceleration, approximate nearest neighbors
- **Use Case**: Semantic search over large memory datasets

### Retrieval System (`retrieval/`)

Intelligent retrieval strategies:

#### Semantic Retrieval (`semantic_retrieval.py`)
- **Method**: Vector similarity search
- **Algorithm**: Cosine similarity with optional re-ranking
- **Features**: Multi-modal retrieval, relevance scoring

#### Hybrid Retrieval (`hybrid_retrieval.py`)
- **Method**: Combines semantic and keyword-based search
- **Benefits**: Improved recall for specific queries
- **Fallback**: Keyword search when semantic search fails

## Data Models

### Interaction Schema

```python
@dataclass
class Interaction:
    timestamp: float
    user_id: str
    user_message: str
    agent_response: str
    tool_calls: List[ToolCall]
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
```

### Memory Item Schema

```python
@dataclass
class MemoryItem:
    id: str
    content: str
    metadata: Dict[str, Any]
    embedding: List[float]
    similarity_score: float
    timestamp: float
```

## Usage Examples

### Basic Memory Operations

```python
from backend.src.memory import MemoryManager

# Initialize memory system
memory = MemoryManager()

# Store an interaction
await memory.store_interaction(Interaction(
    timestamp=time.time(),
    user_id="user123",
    user_message="What's the weather?",
    agent_response="I'll check the weather for you.",
    tool_calls=[weather_tool_call],
    metadata={"session_id": "sess_123"}
))

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

### Advanced Retrieval

```python
# Hybrid search with filters
results = await memory.hybrid_search(
    query="Python programming",
    filters={"category": "tutorial", "difficulty": "beginner"},
    limit=10
)

# Temporal retrieval
recent = await memory.retrieve_temporal(
    start_time=datetime.now() - timedelta(days=7),
    end_time=datetime.now(),
    limit=20
)

# Contextual retrieval with conversation history
contextual = await memory.retrieve_contextual(
    current_conversation=conversation_history,
    relevance_threshold=0.75
)
```

## Configuration

Memory system configuration is managed through the main application config:

```yaml
memory:
  enabled: true
  storage_type: "sqlite"  # or "faiss", "hybrid"
  max_history_length: 1000
  embedding_model: "all-MiniLM-L6-v2"
  similarity_threshold: 0.7
  cleanup_interval_hours: 24
  max_memory_items: 50000

embeddings:
  model_name: "sentence-transformers/all-MiniLM-L6-v2"
  device: "cuda"  # or "cpu"
  cache_size: 1000
  batch_size: 32
```

## Performance Optimization

### Caching Strategies
- **Embedding Cache**: Avoid re-computing embeddings for identical text
- **Query Cache**: Cache frequent retrieval queries
- **Result Cache**: Cache search results with TTL

### Storage Optimization
- **Index Optimization**: Regular FAISS index rebuilding
- **Compression**: Vector quantization for reduced storage
- **Partitioning**: Time-based partitioning for large datasets

### Retrieval Optimization
- **Approximate Search**: FAISS IVF indices for faster search
- **Pre-filtering**: Metadata-based filtering before vector search
- **Batch Processing**: Process multiple queries simultaneously

## Privacy & Security

### Data Protection
- **Encryption**: Sensitive metadata is encrypted at rest
- **Access Control**: Memory access restricted by user permissions
- **Data Isolation**: User memories are completely isolated

### Privacy Features
- **Opt-in Storage**: Users can disable memory storage
- **Data Export**: Users can export their memory data
- **Data Deletion**: Complete memory wipe functionality
- **Audit Logging**: Memory access is logged for transparency

## Monitoring & Maintenance

### Health Checks
```python
# Check memory system health
health = await memory.health_check()
# Returns: {"status": "healthy", "items_count": 1234, "storage_size": "45MB"}
```

### Maintenance Operations
```python
# Cleanup old memories
await memory.cleanup_old_entries(older_than_days=30)

# Rebuild search indices
await memory.rebuild_indices()

# Optimize storage
await memory.optimize_storage()
```

### Metrics & Monitoring
- **Storage Metrics**: Memory usage, item counts, growth rate
- **Performance Metrics**: Query latency, retrieval accuracy
- **Health Metrics**: System availability, error rates

## Integration Points

### Agent System Integration
The memory system integrates deeply with the agent orchestrator:

- **Context Retrieval**: Agents automatically retrieve relevant memories
- **Learning**: Agents store successful patterns for future use
- **Personalization**: User preferences and behavior patterns

### Tool System Integration
Tools can leverage memory for enhanced functionality:

- **Context Awareness**: Tools access conversation history
- **Learning**: Tools improve based on past performance
- **Caching**: Tool results cached in memory for faster access

## Future Enhancements

### Planned Features
- **Multi-modal Memory**: Support for images, audio, and video
- **Graph-based Memory**: Relationship-aware memory storage
- **Federated Learning**: Cross-device memory synchronization
- **Advanced Reasoning**: Memory-based causal reasoning

### Research Directions
- **Memory Consolidation**: Automatic memory summarization and consolidation
- **Attention Mechanisms**: Neural attention for memory relevance
- **Meta-learning**: Learning to learn from memory patterns
- **Cognitive Architectures**: Full cognitive memory models

## Troubleshooting

### Common Issues

#### High Memory Usage
```python
# Check memory usage
stats = await memory.get_statistics()
print(f"Total items: {stats['total_items']}")
print(f"Storage size: {stats['storage_size_mb']}MB")

# Cleanup old entries
await memory.cleanup_old_entries(older_than_days=90)
```

#### Slow Retrieval
```python
# Check index health
health = await memory.check_index_health()

# Rebuild indices if needed
if health['needs_rebuild']:
    await memory.rebuild_indices()
```

#### Embedding Errors
```python
# Verify embedding model
try:
    test_embedding = await memory.embeddings.encode_text("test")
    print("Embeddings working correctly")
except Exception as e:
    print(f"Embedding error: {e}")
    # Check model configuration and device availability
```

## API Reference

### MemoryManager Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `store_interaction()` | Store user-agent interaction | `interaction: Interaction` | `None` |
| `retrieve_relevant()` | Get semantically relevant memories | `query: str, limit: int` | `List[MemoryItem]` |
| `search_similar()` | Vector similarity search | `text: str, threshold: float` | `List[MemoryItem]` |
| `hybrid_search()` | Combined semantic/keyword search | `query: str, filters: dict` | `List[MemoryItem]` |
| `cleanup_old_entries()` | Remove old memory entries | `older_than_days: int` | `int` (deleted count) |
| `health_check()` | System health status | - | `Dict[str, Any]` |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable/disable memory system |
| `storage_type` | str | `"sqlite"` | Storage backend type |
| `max_history_length` | int | `1000` | Maximum conversation history length |
| `embedding_model` | str | `"all-MiniLM-L6-v2"` | Sentence transformer model |
| `similarity_threshold` | float | `0.7` | Minimum similarity score |
| `cleanup_interval_hours` | int | `24` | Automatic cleanup interval |

This memory system provides the foundation for persistent, intelligent context management in the Personal Assistant, enabling truly personalized and continuity-aware interactions.
