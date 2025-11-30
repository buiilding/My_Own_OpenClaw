# Performance Optimization Guide

This guide provides comprehensive strategies and techniques for optimizing the performance of the Personal Assistant system, covering caching, database optimization, memory management, and system-level performance tuning.

## Overview

Performance optimization in the Personal Assistant involves multiple layers:

- **Application Layer**: Code optimization, async patterns, caching
- **Database Layer**: Query optimization, indexing, connection pooling
- **Memory Layer**: Efficient data structures, garbage collection, memory pooling
- **Network Layer**: Connection reuse, compression, request batching
- **System Layer**: CPU utilization, I/O optimization, resource limits

## Application Layer Optimization

### Async/Await Patterns

The system heavily uses async patterns for I/O-bound operations.

```python
# Good: Proper async patterns
async def process_user_request(request: Request) -> Response:
    # Parallel processing of independent operations
    conversation_task = asyncio.create_task(load_conversation(request.user_id))
    tools_task = asyncio.create_task(discover_tools(request.query))

    conversation, tools = await asyncio.gather(conversation_task, tools_task)

    # Process LLM request
    llm_response = await llm_client.generate_response(
        messages=build_messages(conversation, request.query),
        tools=tools
    )

    return Response(content=llm_response.content)

# Bad: Blocking operations in async functions
async def bad_example():
    # DON'T DO THIS - blocks the event loop
    time.sleep(1)  # Use await asyncio.sleep(1) instead

    # DON'T DO THIS - synchronous I/O blocks
    with open('file.txt', 'r') as f:  # Use aiofiles instead
        content = f.read()
```

### Context Manager Usage

Proper resource management with context managers:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def database_session():
    session = await get_database_session()
    try:
        yield session
    finally:
        await session.close()

@asynccontextmanager
async def llm_client_session():
    client = get_llm_client()
    try:
        yield client
    finally:
        await client.cleanup()

# Usage
async def handle_request(request):
    async with database_session() as db, llm_client_session() as llm:
        user_data = await db.get_user(request.user_id)
        response = await llm.generate_response(user_data.context)
        return response
```

### Efficient Data Structures

Choose appropriate data structures for performance:

```python
from typing import Dict, List, Set
from collections import defaultdict, deque
import heapq

# Use sets for membership testing
user_permissions = {"read", "write", "execute"}  # O(1) lookup
if "admin" in user_permissions:  # Fast membership test

# Use deques for FIFO operations
recent_messages = deque(maxlen=100)  # Automatic size management
recent_messages.append(new_message)  # O(1) append

# Use defaultdict for grouping
tool_usage = defaultdict(int)  # Automatic key creation
tool_usage["weather_tool"] += 1

# Use heaps for priority queues
priority_tasks = []
heapq.heappush(priority_tasks, (priority, task))
highest_priority_task = heapq.heappop(priority_tasks)
```

## Caching Strategies

### Multi-Level Caching

The system implements multiple caching layers:

```python
from backend.src.core.cache import MultiLevelCache

cache = MultiLevelCache(
    l1_cache=MemoryCache(max_size=1000, ttl=300),  # 5min
    l2_cache=RedisCache(max_size=10000, ttl=3600), # 1hour
    l3_cache=FileCache(max_size=50000, ttl=86400)  # 24hours
)

# Cache LLM responses
@cache.cached(key_prefix="llm", ttl=1800)
async def generate_response_cached(messages, model, temperature):
    return await llm_client.generate_response(messages, model, temperature)

# Cache tool results
@cache.cached(key_prefix="tool", ttl=600)
async def execute_tool_cached(tool_name, args):
    return await tool_registry.execute(tool_name, args)

# Cache user context
@cache.cached(key_prefix="user_context", ttl=300)
async def get_user_context_cached(user_id):
    return await memory_manager.get_user_context(user_id)
```

### Cache Key Generation

Effective cache key strategies:

```python
from backend.src.core.cache import CacheKeyGenerator

key_generator = CacheKeyGenerator()

# Generate stable keys for LLM requests
llm_key = key_generator.generate_llm_key(
    messages=messages,
    model=model,
    temperature=temperature,
    # Exclude non-deterministic parameters
)

# Generate keys for tool execution
tool_key = key_generator.generate_tool_key(
    tool_name=tool_name,
    args=args,
    user_id=user_id,  # Include user context
)

# Generate keys for search results
search_key = key_generator.generate_search_key(
    query=query,
    filters=filters,
    sort_by=sort_by,
    limit=limit,
)
```

### Cache Invalidation Strategies

```python
from backend.src.core.cache import CacheInvalidationManager

invalidation_manager = CacheInvalidationManager(cache)

# Time-based invalidation (automatic with TTL)

# Event-based invalidation
async def handle_user_update(user_id, new_data):
    # Invalidate user-specific caches
    await invalidation_manager.invalidate_pattern(f"user:{user_id}:*")

    # Update user data
    await database.update_user(user_id, new_data)

# Manual invalidation
await invalidation_manager.invalidate_keys([
    f"user:{user_id}:context",
    f"user:{user_id}:preferences"
])

# Selective invalidation
await invalidation_manager.invalidate_by_tag("user_profile")
```

## Database Optimization

### Query Optimization

Efficient database queries and indexing:

```python
# Good: Indexed queries
async def get_recent_conversations(user_id: str, limit: int = 10):
    # Assumes index on (user_id, timestamp)
    return await db.execute("""
        SELECT * FROM conversations
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
    """, user_id, limit)

# Good: Batch operations
async def bulk_update_conversation_status(conversation_ids: List[str], status: str):
    await db.execute("""
        UPDATE conversations
        SET status = $1, updated_at = NOW()
        WHERE id = ANY($2)
    """, status, conversation_ids)

# Bad: N+1 queries
async def bad_get_conversations_with_users(conversation_ids: List[str]):
    conversations = []
    for conv_id in conversation_ids:
        # DON'T DO THIS - results in N queries
        conv = await db.get_conversation(conv_id)
        user = await db.get_user(conv.user_id)  # Additional query per conversation
        conversations.append({**conv, "user": user})
    return conversations

# Good: Join in single query
async def good_get_conversations_with_users(conversation_ids: List[str]):
    return await db.execute("""
        SELECT c.*, u.name, u.email
        FROM conversations c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ANY($1)
    """, conversation_ids)
```

### Connection Pooling

Efficient database connection management:

```python
from backend.src.core.database import DatabasePool

db_pool = DatabasePool(
    min_connections=5,
    max_connections=20,
    connection_timeout=30,
    idle_timeout=300
)

# Connection reuse
async def execute_query(query, *args):
    async with db_pool.acquire() as conn:
        return await conn.execute(query, *args)

# Connection health monitoring
async def monitor_connections():
    stats = await db_pool.get_stats()
    print(f"Active connections: {stats.active}")
    print(f"Idle connections: {stats.idle}")
    print(f"Pending requests: {stats.pending}")

    if stats.pending > stats.max_connections * 0.8:
        print("Warning: High connection utilization")
```

### Index Optimization

Strategic indexing for query performance:

```sql
-- Composite index for conversation queries
CREATE INDEX idx_conversations_user_timestamp
ON conversations (user_id, timestamp DESC);

-- Partial index for active conversations
CREATE INDEX idx_conversations_active
ON conversations (user_id, timestamp DESC)
WHERE status = 'active';

-- Index for text search
CREATE INDEX idx_conversations_content_gin
ON conversations USING gin(to_tsvector('english', content));

-- Index for JSON data
CREATE INDEX idx_tool_calls_args
ON tool_calls USING gin(args jsonb_path_ops);
```

## Memory Management

### Memory Pooling

Efficient memory reuse for frequent allocations:

```python
from backend.src.core.memory import ObjectPool, BufferPool

# Object pooling for frequently created objects
message_pool = ObjectPool(
    factory=lambda: {"role": "", "content": "", "metadata": {}},
    max_size=1000
)

async def create_message(role: str, content: str) -> dict:
    message = await message_pool.acquire()
    message.update({"role": role, "content": content})
    return message

async def release_message(message: dict):
    # Reset object state
    message["role"] = ""
    message["content"] = ""
    message["metadata"].clear()
    await message_pool.release(message)

# Buffer pooling for I/O operations
buffer_pool = BufferPool(
    buffer_size=8192,  # 8KB buffers
    max_buffers=100
)

async def read_file_chunked(file_path: str):
    async with buffer_pool.acquire() as buffer:
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.readinto(buffer):
                yield buffer[:chunk]
```

### Garbage Collection Tuning

Optimize Python's garbage collector:

```python
import gc

class GCTuner:
    def __init__(self):
        # Disable automatic GC during high-throughput operations
        self.original_threshold = gc.get_threshold()

    def disable_gc(self):
        # Increase thresholds to reduce GC frequency
        gc.set_threshold(10000, 10, 10)  # Much higher thresholds

    def enable_gc(self):
        gc.set_threshold(*self.original_threshold)

    async def run_high_throughput_operation(self):
        self.disable_gc()
        try:
            # Perform memory-intensive operations
            await self.process_batch_data()
        finally:
            self.enable_gc()
            # Force collection to clean up
            gc.collect()
```

### Memory Monitoring

Track and monitor memory usage:

```python
import psutil
import tracemalloc
from backend.src.core.monitoring import MemoryMonitor

monitor = MemoryMonitor()

async def monitor_memory_usage():
    # Start memory tracing
    tracemalloc.start()

    # Get current memory usage
    process = psutil.Process()
    memory_info = process.memory_info()

    print(f"RSS: {memory_info.rss / 1024 / 1024:.1f}MB")
    print(f"VMS: {memory_info.vms / 1024 / 1024:.1f}MB")

    # Get memory breakdown
    current, peak = tracemalloc.get_traced_memory()
    print(f"Current memory usage: {current / 1024 / 1024:.1f}MB")
    print(f"Peak memory usage: {peak / 1024 / 1024:.1f}MB")

    # Get top memory consumers
    snapshot = tracemalloc.take_snapshot()
    top_stats = snapshot.statistics('lineno')

    print("\nTop memory consumers:")
    for stat in top_stats[:10]:
        print(f"{stat.size / 1024 / 1024:.1f}MB - {stat.traceback}")

# Memory leak detection
async def detect_memory_leaks():
    initial_memory = psutil.Process().memory_info().rss

    # Run operations
    await perform_operations()

    final_memory = psutil.Process().memory_info().rss
    memory_growth = final_memory - initial_memory

    if memory_growth > 50 * 1024 * 1024:  # 50MB threshold
        print(f"Warning: Memory growth of {memory_growth / 1024 / 1024:.1f}MB detected")
        await monitor.investigate_leak()
```

## Network Optimization

### Connection Reuse

Efficient HTTP connection management:

```python
import aiohttp
from backend.src.core.network import ConnectionPool

class HTTPClientPool:
    def __init__(self):
        self.connector = aiohttp.TCPConnector(
            limit=100,  # Max connections per host
            limit_per_host=10,
            ttl_dns_cache=300,  # DNS cache TTL
            use_dns_cache=True,
            keepalive_timeout=60,
            enable_cleanup_closed=True,
        )

        self.session = aiohttp.ClientSession(
            connector=self.connector,
            timeout=aiohttp.ClientTimeout(total=30, connect=10),
            headers={"User-Agent": "Personal-Assistant/1.0"}
        )

    async def request(self, method, url, **kwargs):
        async with self.session.request(method, url, **kwargs) as response:
            return await response.json()

    async def close(self):
        await self.session.close()

# Usage
http_pool = HTTPClientPool()

# Connections are automatically reused
response1 = await http_pool.request('GET', 'https://api.example.com/data1')
response2 = await http_pool.request('GET', 'https://api.example.com/data2')
```

### Request Batching

Batch multiple requests to reduce overhead:

```python
from backend.src.core.batching import RequestBatcher

class APIRequestBatcher:
    def __init__(self, max_batch_size=10, max_wait_time=0.5):
        self.batcher = RequestBatcher(max_batch_size, max_wait_time)
        self.http_client = HTTPClientPool()

    async def batch_api_calls(self, requests):
        # Group requests by endpoint
        endpoint_groups = defaultdict(list)
        for req in requests:
            endpoint_groups[req.endpoint].append(req)

        # Execute batches
        results = []
        for endpoint, reqs in endpoint_groups.items():
            if len(reqs) == 1:
                # Single request
                result = await self.http_client.request(
                    reqs[0].method, endpoint, **reqs[0].kwargs
                )
                results.append(result)
            else:
                # Batch multiple requests
                batch_result = await self.execute_batch(endpoint, reqs)
                results.extend(batch_result)

        return results

    async def execute_batch(self, endpoint, requests):
        # Implement batch API call
        batch_data = {"requests": [req.data for req in requests]}

        batch_response = await self.http_client.request(
            'POST', f"{endpoint}/batch", json=batch_data
        )

        return batch_response["results"]
```

### Compression and Optimization

Enable compression for network traffic:

```python
# Server-side compression
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB

# Client-side compression
async def compressed_request(url, data):
    headers = {"Content-Encoding": "gzip"}

    # Compress request data
    import gzip
    compressed_data = gzip.compress(json.dumps(data).encode())

    async with aiohttp.ClientSession() as session:
        async with session.post(url, data=compressed_data, headers=headers) as resp:
            return await resp.json()
```

## System-Level Optimization

### CPU Optimization

Efficient CPU utilization:

```python
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

class ComputationManager:
    def __init__(self):
        # Use process pool for CPU-intensive tasks
        self.process_pool = ProcessPoolExecutor(max_workers=multiprocessing.cpu_count())

        # Use thread pool for I/O-bound tasks
        self.thread_pool = ThreadPoolExecutor(max_workers=20)

    async def run_cpu_task(self, func, *args):
        """Run CPU-intensive task in process pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.process_pool, func, *args)

    async def run_io_task(self, func, *args):
        """Run I/O-bound task in thread pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.thread_pool, func, *args)

# Usage
computation_manager = ComputationManager()

# CPU-intensive: embeddings calculation
embeddings = await computation_manager.run_cpu_task(
    calculate_embeddings, texts
)

# I/O-bound: file operations
file_content = await computation_manager.run_io_task(
    read_large_file, file_path
)
```

### I/O Optimization

Efficient file and disk operations:

```python
import aiofiles
from backend.src.core.io import BufferedFileReader

class OptimizedFileOperations:
    async def read_large_file_efficiently(self, file_path: str, chunk_size: int = 8192):
        """Read large files with controlled memory usage"""
        total_content = []

        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(chunk_size):
                total_content.append(chunk)

                # Yield control to event loop periodically
                if len(total_content) % 100 == 0:
                    await asyncio.sleep(0)

        return b''.join(total_content)

    async def write_with_buffering(self, file_path: str, data_stream):
        """Write data with output buffering"""
        async with aiofiles.open(file_path, 'wb') as f:
            buffer = bytearray(8192)  # 8KB buffer
            buffer_pos = 0

            async for chunk in data_stream:
                if buffer_pos + len(chunk) > len(buffer):
                    # Flush buffer
                    await f.write(buffer[:buffer_pos])
                    buffer_pos = 0

                # Add to buffer
                buffer[buffer_pos:buffer_pos + len(chunk)] = chunk
                buffer_pos += len(chunk)

            # Final flush
            if buffer_pos > 0:
                await f.write(buffer[:buffer_pos])

# Memory-mapped files for large datasets
import mmap

async def search_large_file(file_path: str, search_term: str):
    """Memory-map large files for efficient searching"""
    with open(file_path, 'rb') as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            position = mm.find(search_term.encode())
            if position != -1:
                # Read surrounding context
                start = max(0, position - 100)
                end = min(len(mm), position + len(search_term) + 100)
                return mm[start:end].decode(errors='ignore')
    return None
```

### Resource Limits

Implement resource limits to prevent system overload:

```python
from backend.src.core.limits import ResourceLimiter

limiter = ResourceLimiter(
    max_concurrent_requests=100,
    max_memory_usage_gb=4,
    max_cpu_usage_percent=80,
    max_disk_usage_gb=10
)

class RequestHandler:
    async def handle_request(self, request):
        # Check resource limits
        if not await limiter.check_limits():
            raise HTTPException(status_code=503, detail="System overloaded")

        # Acquire resources
        async with limiter.acquire_resources(memory_mb=50, cpu_percent=5):
            return await self.process_request(request)

# Rate limiting
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

app.state.limiter = limiter

@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    # Apply rate limits
    response = await limiter(request, call_next)
    return response
```

## Performance Monitoring

### Metrics Collection

Comprehensive performance metrics:

```python
from backend.src.core.monitoring import PerformanceMonitor

monitor = PerformanceMonitor()

# Track function performance
@monitor.timed("llm_request")
async def generate_llm_response(messages, model):
    start_time = time.time()
    response = await llm_client.generate_response(messages, model)
    duration = time.time() - start_time

    # Record metrics
    await monitor.record_metric("llm_response_time", duration)
    await monitor.record_metric("llm_response_tokens", response.token_count)

    return response

# Track system resources
async def monitor_system_resources():
    while True:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory_percent = psutil.virtual_memory().percent
        disk_percent = psutil.disk_usage('/').percent

        await monitor.record_metric("cpu_usage_percent", cpu_percent)
        await monitor.record_metric("memory_usage_percent", memory_percent)
        await monitor.record_metric("disk_usage_percent", disk_percent)

        await asyncio.sleep(60)  # Monitor every minute

# Performance profiling
import cProfile
import pstats

async def profile_function(func, *args, **kwargs):
    profiler = cProfile.Profile()
    profiler.enable()

    try:
        result = await func(*args, **kwargs)
        return result
    finally:
        profiler.disable()

        # Analyze results
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')
        stats.print_stats(20)  # Top 20 functions
```

### Performance Alerts

Set up performance alerts and thresholds:

```python
from backend.src.core.monitoring import AlertManager

alert_manager = AlertManager()

# Define performance thresholds
alert_manager.add_threshold(
    metric="llm_response_time",
    threshold=10.0,  # seconds
    operator=">",
    alert_level="warning",
    message="LLM response time exceeds 10 seconds"
)

alert_manager.add_threshold(
    metric="memory_usage_percent",
    threshold=90.0,
    operator=">",
    alert_level="critical",
    message="Memory usage above 90%"
)

# Check thresholds periodically
async def check_performance_alerts():
    while True:
        alerts = await alert_manager.check_thresholds()

        for alert in alerts:
            if alert.level == "critical":
                await notify_admin(alert.message)
            elif alert.level == "warning":
                logger.warning(alert.message)

        await asyncio.sleep(300)  # Check every 5 minutes
```

## Configuration Optimization

Performance-related configuration:

```yaml
performance:
  # Caching
  cache:
    enabled: true
    l1_ttl_seconds: 300
    l2_ttl_seconds: 3600
    max_memory_mb: 512

  # Database
  database:
    min_connections: 5
    max_connections: 20
    connection_timeout: 30
    idle_timeout: 300

  # Memory
  memory:
    gc_threshold: 10000
    buffer_pool_size: 100
    object_pool_max_size: 1000

  # Network
  network:
    connection_pool_size: 100
    connection_timeout: 30
    keep_alive_timeout: 60
    compression_enabled: true

  # System limits
  limits:
    max_concurrent_requests: 100
    max_memory_usage_gb: 4
    max_cpu_usage_percent: 80
    request_timeout_seconds: 60

  # Monitoring
  monitoring:
    metrics_enabled: true
    profiling_enabled: false
    alert_check_interval_seconds: 300

# Provider-specific optimizations
llm:
  openai:
    max_concurrent_requests: 10
    request_timeout: 30
    retry_attempts: 3

  anthropic:
    max_concurrent_requests: 5
    request_timeout: 60
    retry_attempts: 2
```

## Troubleshooting Performance Issues

### Profiling Techniques

```python
import asyncio
from backend.src.core.profiling import AsyncProfiler

async def profile_request_handling():
    profiler = AsyncProfiler()

    # Profile a request
    async with profiler.profile("handle_request"):
        response = await handle_user_request(request)

    # Get profiling results
    stats = profiler.get_stats()

    print("Performance profile:")
    for func_name, func_stats in stats.items():
        print(f"{func_name}: {func_stats.total_time:.3f}s ({func_stats.call_count} calls)")

# Memory profiling
from memory_profiler import profile

@profile
async def memory_intensive_operation():
    # This function will have its memory usage profiled
    large_data = []
    for i in range(10000):
        large_data.append(f"item_{i}" * 100)  # Create large strings

    # Process data
    processed = [item.upper() for item in large_data]

    return len(processed)

# CPU profiling
import cProfile

def profile_sync_function():
    profiler = cProfile.Profile()
    profiler.enable()

    # Run synchronous code
    result = sync_operation()

    profiler.disable()

    # Print top 10 functions by cumulative time
    stats = pstats.Stats(profiler)
    stats.sort_stats('cumulative')
    stats.print_stats(10)

    return result
```

### Common Performance Issues

#### Memory Leaks

```python
# Detect memory leaks
async def detect_memory_leaks():
    initial_objects = len(gc.get_objects())

    # Run operations that might leak
    await perform_operations()

    final_objects = len(gc.get_objects())
    object_growth = final_objects - initial_objects

    if object_growth > 1000:  # Arbitrary threshold
        print(f"Potential memory leak: {object_growth} new objects")

        # Get object types
        objects_by_type = defaultdict(int)
        for obj in gc.get_objects():
            objects_by_type[type(obj).__name__] += 1

        # Print top object types
        sorted_types = sorted(objects_by_type.items(), key=lambda x: x[1], reverse=True)
        for obj_type, count in sorted_types[:10]:
            print(f"  {obj_type}: {count}")

        # Force garbage collection
        collected = gc.collect()
        print(f"Garbage collected: {collected} objects")

#### Slow Database Queries

```python
# Identify slow queries
async def analyze_slow_queries():
    # Enable query logging
    await db.execute("SET log_statement = 'all'")
    await db.execute("SET log_duration = 'on'")

    # Run queries and check logs
    start_time = time.time()
    results = await db.execute("SELECT * FROM large_table WHERE condition = $1", param)
    duration = time.time() - start_time

    if duration > 1.0:  # More than 1 second
        print(f"Slow query detected: {duration:.3f}s")

        # Analyze query plan
        plan = await db.execute("EXPLAIN ANALYZE SELECT * FROM large_table WHERE condition = $1", param)

        print("Query plan:")
        for line in plan:
            print(f"  {line}")

        # Suggest optimizations
        if "Seq Scan" in str(plan):
            print("Consider adding an index on the condition column")

#### High CPU Usage

```python
# Profile CPU usage
async def profile_cpu_usage():
    import yappi

    yappi.start()

    # Run code to profile
    await perform_operations()

    yappi.stop()

    # Get profiling stats
    stats = yappi.get_func_stats()

    print("CPU profiling results:")
    stats.sort("totaltime").print_all()

    # Focus on top time consumers
    print("\nTop 10 functions by total time:")
    for stat in stats[:10]:
        print(f"{stat.name}: {stat.totaltime:.3f}s")

# Optimize CPU-intensive operations
from numba import jit

@jit(nopython=True)
def optimized_computation(data):
    """JIT-compiled CPU-intensive computation"""
    result = 0
    for i in range(len(data)):
        result += data[i] ** 2
    return result

async def cpu_optimized_processing():
    # Move CPU-intensive work to compiled function
    data = np.array([1, 2, 3, ..., 1000000])
    result = await computation_manager.run_cpu_task(optimized_computation, data)
    return result
```

This comprehensive performance optimization guide provides the foundation for maintaining high-performance operation of the Personal Assistant system across all layers and components.</contents>
</xai:function_call">
