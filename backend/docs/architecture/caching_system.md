# Caching System

This document describes the Personal Assistant's multi-level caching system designed for performance optimization and resource efficiency.

## Overview

The caching system provides intelligent caching across multiple layers to reduce computational overhead and API calls. It implements a unified caching interface with configurable TTL (Time-To-Live) support and thread-safe operations.

## Architecture

### Core Components

#### Cache Manager (`src/core/cache.py`)

Central caching service with the following features:

- **Thread-Safe Operations**: Atomic cache access supporting concurrent multi-user environments
- **TTL Support**: Configurable expiration times for different cache types
- **Statistics Tracking**: Hit/miss ratios and performance metrics
- **Hash-Based Keys**: Efficient lookups with consistent key generation
- **Memory Management**: Automatic cleanup of expired entries

#### Cache Types

##### Embedding Cache

**Purpose**: Avoid recomputing text embeddings for identical content

**Key Features**:
- Hash-based cache keys for text content
- Configurable TTL (default: 24 hours)
- Memory-efficient storage of numpy arrays
- Automatic cleanup of stale embeddings

**Usage**:
```python
from backend.src.core.cache import cache_manager

# Cache is automatically used by embedding providers
embedding = embedder.embed_text("Hello, world!")
# Second call with same text uses cached result
```

##### Schema Cache

**Purpose**: Cache tool JSON schemas to avoid regeneration overhead

**Key Features**:
- Automatic invalidation on tool changes
- Schema validation caching
- Function declaration caching for LLM integration

##### Query Cache

**Purpose**: Cache frequent memory retrieval queries

**Key Features**:
- Semantic search result caching
- User-scoped cache isolation
- Configurable cache sizes per user

## Configuration

Cache settings are configured through the main application config:

```yaml
caching:
  enabled: true
  default_ttl_seconds: 3600  # 1 hour default
  max_memory_mb: 512         # Memory limit
  embedding_cache_ttl: 86400 # 24 hours for embeddings
  cleanup_interval_minutes: 30 # Automatic cleanup interval
```

## Performance Benefits

### Embedding Reuse
- **API Reduction**: Up to 90% reduction in embedding API calls for repeated content
- **Response Time**: Sub-millisecond cache hits vs. seconds for computation
- **Cost Savings**: Significant reduction in embedding provider costs

### Schema Caching
- **Tool Loading**: Faster tool discovery and registration
- **LLM Integration**: Reduced latency in tool schema provision
- **Memory Efficiency**: Avoid redundant schema generation

### Memory Query Caching
- **Retrieval Speed**: Instant results for frequent queries
- **Database Load**: Reduced database queries for semantic search
- **Scalability**: Better performance under high concurrency

## Cache Statistics

The system provides comprehensive cache statistics:

```python
stats = cache_manager.get_stats()
print(f"Hit Rate: {stats['hit_rate']:.2%}")
print(f"Total Entries: {stats['total_entries']}")
print(f"Memory Usage: {stats['memory_usage_mb']}MB")
```

## Cache Invalidation

### Automatic Invalidation
- **TTL Expiration**: Time-based automatic cleanup
- **LRU Eviction**: Least recently used entries removed under memory pressure
- **Content Changes**: Schema cache invalidation on tool modifications

### Manual Invalidation
```python
# Clear specific cache type
cache_manager.clear_embedding_cache()
cache_manager.clear_schema_cache()

# Clear all caches
cache_manager.clear_all()
```

## Monitoring and Maintenance

### Health Checks
```python
# Check cache health
health = cache_manager.health_check()
# Returns: status, memory_usage, hit_rate, etc.
```

### Maintenance Operations
```python
# Periodic cleanup (runs automatically)
await cache_manager.cleanup_expired()

# Optimize memory usage
cache_manager.optimize_memory()

# Export cache statistics
stats = cache_manager.export_stats()
```

## Future Enhancements

### Planned Features
- **Distributed Caching**: Redis integration for multi-instance deployments
- **Cache Compression**: Reduce memory footprint for large embeddings
- **Smart Prefetching**: Predictive caching based on usage patterns
- **Cache Analytics**: Detailed usage analytics and optimization recommendations

## Troubleshooting

### High Memory Usage
```python
# Check memory usage
stats = cache_manager.get_stats()
if stats['memory_usage_mb'] > config.caching.max_memory_mb:
    cache_manager.optimize_memory()
```

### Low Hit Rates
```python
# Analyze cache performance
stats = cache_manager.get_stats()
if stats['hit_rate'] < 0.5:
    # Consider adjusting TTL or cache size
    config.caching.default_ttl_seconds *= 2
```

### Cache Corruption
```python
# Clear and rebuild cache
cache_manager.clear_all()
# Cache will rebuild automatically on next use
```

## API Reference

### CacheManager Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `get(key)` | Retrieve cached value | `key: str` | `Any \| None` |
| `set(key, value, ttl)` | Store value with TTL | `key: str, value: Any, ttl: float` | `None` |
| `delete(key)` | Remove specific entry | `key: str` | `bool` |
| `clear_all()` | Clear all caches | - | `None` |
| `get_stats()` | Get cache statistics | - | `Dict[str, Any]` |
| `health_check()` | Check cache health | - | `Dict[str, Any]` |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `caching.enabled` | bool | `true` | Enable/disable caching system |
| `caching.default_ttl_seconds` | int | `3600` | Default TTL in seconds |
| `caching.max_memory_mb` | int | `512` | Maximum memory usage in MB |
| `caching.cleanup_interval_minutes` | int | `30` | Cleanup interval in minutes |
| `caching.embedding_cache_ttl` | int | `86400` | Embedding cache TTL (24h) |

This caching system provides the foundation for high-performance, scalable operation of the Personal Assistant while maintaining resource efficiency and cost optimization.
