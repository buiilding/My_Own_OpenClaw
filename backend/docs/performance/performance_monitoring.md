# Performance Monitoring Guide

This guide outlines basic performance considerations for the Personal Assistant Backend. Note that comprehensive monitoring infrastructure is not currently implemented.

## Current Performance Monitoring

### Basic Monitoring Available

#### Tool Execution Audit Logs
- **Location**: `SecurityPolicy.audit_log`
- **Description**: Basic logging of tool executions with timing information
- **Implementation**: Simple list-based audit trail with configurable size limits
- **Usage**:
  ```python
  # Access audit logs
  audit_logs = security_policy.get_audit_log(limit=100)

  # Each log entry contains:
  # - tool_name, user_id, session_id
  # - parameters, success, execution_time, error
  ```

#### Application Logging
- **Framework**: Python logging with configurable levels
- **Output**: Console and file logging
- **Levels**: DEBUG, INFO, WARNING, ERROR
- **Configuration**: Via environment variable `LOG_LEVEL`

### Performance Considerations

#### Response Time Guidelines
- **Simple queries**: Target < 3 seconds
- **Complex queries**: Target < 10 seconds
- **Tool execution**: Target < 5 seconds per tool
- **WebSocket latency**: Target < 100ms

#### Resource Limits (Implemented)
- **Timeout**: 30 seconds per tool execution
- **Memory**: Configurable per tool (default unlimited)
- **Concurrent tools**: Max 3 simultaneous executions
- **File size**: Configurable limits for file operations

### Resource Utilization Metrics

#### Memory Usage
- **Metric**: `assistant.memory.usage`
- **Description**: RAM consumption by the application
- **Target**: < 80% of available memory
- **Components**:
  - Conversation history storage
  - Tool execution contexts
  - LLM response caching

#### CPU Usage
- **Metric**: `assistant.cpu.usage`
- **Description**: CPU utilization percentage
- **Target**: < 70% sustained usage
- **Bottlenecks**: LLM inference, tool execution, serialization

#### Disk I/O
- **Metric**: `assistant.disk.io.rate`
- **Description**: Read/write operations per second
- **Target**: < 1000 IOPS
- **Components**: Memory storage, log files, temp files

### Error Metrics

#### Error Rate
- **Metric**: `assistant.error.rate`
- **Description**: Percentage of failed operations
- **Target**: < 5% error rate
- **Types**:
  - Query processing errors
  - Tool execution failures
  - WebSocket connection errors
  - LLM provider errors

#### Error Breakdown
- **Metric**: `assistant.error.by_type`
- **Description**: Errors categorized by type
- **Tracking**: 4xx vs 5xx, timeout vs failure

### LLM Provider Metrics

#### API Call Latency
- **Metric**: `assistant.llm.provider.latency`
- **Description**: Time spent calling LLM providers
- **Target**: < 2 seconds for completions
- **Providers**: OpenAI, Anthropic, etc.

#### Token Usage
- **Metric**: `assistant.llm.tokens.used`
- **Description**: Input/output tokens consumed
- **Tracking**: Cost monitoring, usage limits
- **Optimization**: Token-efficient prompting

#### Rate Limit Monitoring
- **Metric**: `assistant.llm.rate_limit.remaining`
- **Description**: Remaining API calls before rate limit
- **Alerting**: Alert when < 20% remaining

## Monitoring Architecture

### Application-Level Monitoring

#### Built-in Metrics Collection
```python
from backend.src.core.metrics import metrics

class MetricsCollector:
    def __init__(self):
        self.query_count = metrics.Counter('assistant.query.count')
        self.query_duration = metrics.Histogram('assistant.query.duration')
        self.error_count = metrics.Counter('assistant.error.count')

    async def record_query(self, duration: float, success: bool):
        self.query_count.inc()
        self.query_duration.observe(duration)
        if not success:
            self.error_count.inc()
```

#### Health Check Endpoints
```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    """Basic health check."""
    return {"status": "healthy", "timestamp": datetime.utcnow()}

@router.get("/ready")
async def readiness_check():
    """Readiness check including dependencies."""
    # Check LLM provider connectivity
    # Check database connectivity
    # Check tool registry health
    return {"status": "ready"}

@router.get("/metrics")
async def metrics_endpoint():
    """Prometheus-compatible metrics."""
    return metrics.generate_prometheus_output()
```

### Infrastructure Monitoring

#### System Metrics
- **Host Monitoring**: CPU, memory, disk, network
- **Container Metrics**: Docker stats, Kubernetes metrics
- **Network Monitoring**: Latency, packet loss, bandwidth

#### Database Monitoring
- **Connection Pool**: Active/idle connections
- **Query Performance**: Slow query monitoring
- **Storage Usage**: Database size, growth rate

### External Service Monitoring

#### LLM Provider Monitoring
- **API Health**: Provider status endpoints
- **Rate Limits**: Current usage vs limits
- **Error Rates**: Provider-specific errors

#### Third-Party Services
- **External APIs**: Response times, error rates
- **File Storage**: Upload/download performance
- **CDN/Content Delivery**: Cache hit rates

## Monitoring Tools and Setup

### Prometheus + Grafana Stack

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'personal-assistant'
    static_configs:
      - targets: ['localhost:8765']
    metrics_path: '/metrics'
```

#### Grafana Dashboards

**Core Metrics Dashboard**:
- Query response time (95th percentile)
- Error rate percentage
- Active connections gauge
- Memory usage trend

**LLM Metrics Dashboard**:
- Token usage by provider
- API call latency
- Rate limit remaining
- Model selection distribution

**System Resources Dashboard**:
- CPU usage percentage
- Memory usage trend
- Disk I/O rates
- Network throughput

### Application Logging

#### Structured Logging Setup
```python
import logging
import json
from pythonjsonlogger import jsonlogger

logger = logging.getLogger()
handler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter(
    fmt='%(asctime)s %(name)s %(levelname)s %(message)s'
)
handler.setFormatter(formatter)
logger.addHandler(handler)

# Usage
logger.info("Query processed", extra={
    "user_id": user_id,
    "query_length": len(query),
    "response_time": duration,
    "tool_count": len(tools_used)
})
```

#### Log Aggregation
- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Fluentd**: Log collection and forwarding
- **CloudWatch**: AWS log aggregation
- **DataDog**: Cloud monitoring platform

### Alerting Configuration

#### Critical Alerts
```yaml
# Alert when error rate > 10%
- alert: HighErrorRate
  expr: rate(assistant_error_total[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected"

# Alert when response time > 10s (95th percentile)
- alert: SlowResponseTime
  expr: histogram_quantile(0.95, rate(assistant_query_duration_bucket[5m])) > 10
  for: 2m
  labels:
    severity: warning
```

#### Warning Alerts
- Memory usage > 85%
- CPU usage > 80%
- WebSocket connection failures > 5%
- LLM provider errors > 2%

#### Info Alerts
- Deployment completed
- Configuration changes
- New version deployed

## Performance Profiling

### Code Profiling

#### Function-Level Profiling
```python
import cProfile
import pstats

def profile_function(func):
    def wrapper(*args, **kwargs):
        profiler = cProfile.Profile()
        profiler.enable()
        result = func(*args, **kwargs)
        profiler.disable()

        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative').print_stats(20)
        return result
    return wrapper

@profile_function
async def process_complex_query(query: str):
    # Complex processing logic
    pass
```

#### Memory Profiling
```python
import tracemalloc
import psutil

class MemoryProfiler:
    def __init__(self):
        self.snapshots = []

    def start(self):
        tracemalloc.start()

    def snapshot(self, label: str):
        snapshot = tracemalloc.take_snapshot()
        self.snapshots.append((label, snapshot))

    def report(self):
        for label, snapshot in self.snapshots:
            stats = snapshot.statistics('lineno')
            print(f"\n{label}:")
            for stat in stats[:10]:
                print(f"  {stat}")
```

### Load Testing

#### Basic Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:8765/health

# Using wrk for WebSocket testing
wrk -t4 -c100 -d30s ws://localhost:8765/ws
```

#### Query Load Testing
```python
import asyncio
import websockets
import json

async def load_test_queries(num_clients: int, duration: int):
    async def client_session(client_id: int):
        uri = "ws://localhost:8765/ws"
        async with websockets.connect(uri) as websocket:
            # Handshake
            await websocket.send(json.dumps({
                "type": "handshake",
                "user_id": f"load-test-{client_id}"
            }))

            start_time = asyncio.get_event_loop().time()
            query_count = 0

            while asyncio.get_event_loop().time() - start_time < duration:
                # Send query
                await websocket.send(json.dumps({
                    "id": f"query-{client_id}-{query_count}",
                    "type": "query",
                    "payload": {"text": f"Test query {query_count}"}
                }))

                # Wait for response
                response = await websocket.recv()
                query_count += 1

            return query_count

    # Run multiple clients concurrently
    tasks = [client_session(i) for i in range(num_clients)]
    results = await asyncio.gather(*tasks)
    total_queries = sum(results)
    print(f"Total queries processed: {total_queries}")
    print(f"QPS: {total_queries / duration}")
```

## Performance Optimization Strategies

### Caching Strategies

#### Response Caching
```python
from functools import lru_cache
from backend.src.core.cache import cached

class ResponseCache:
    @lru_cache(maxsize=1000)
    def get_cached_response(self, query_hash: str) -> Optional[str]:
        """Cache frequently asked questions."""
        return self.cache.get(query_hash)

    @cached(ttl=300)  # 5-minute cache
    async def get_expensive_data(self, key: str) -> Any:
        """Cache expensive operations."""
        return await self.fetch_from_api(key)
```

#### Tool Schema Caching
- Cache tool JSON schemas in memory
- Cache tool discovery results
- Cache LLM provider model lists

### Database Optimization

#### Connection Pooling
```python
import asyncpg

class DatabaseManager:
    def __init__(self):
        self.pool = None

    async def initialize(self):
        self.pool = await asyncpg.create_pool(
            min_size=5,
            max_size=20,
            database='assistant'
        )

    async def execute_query(self, query: str, params=None):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *params)
```

#### Query Optimization
- Use indexes on frequently queried columns
- Implement pagination for large result sets
- Use efficient queries with proper JOINs

### Async Optimization

#### Concurrent Processing
```python
async def process_parallel_tasks(self, tasks: List[Dict]) -> List[Any]:
    """Process multiple tasks concurrently."""
    async def process_task(task: Dict) -> Any:
        # Process individual task
        return await self.process_single_task(task)

    # Execute all tasks concurrently
    results = await asyncio.gather(*[process_task(t) for t in tasks])
    return results
```

#### Resource Pool Management
- Limit concurrent LLM API calls
- Pool database connections
- Limit concurrent tool executions

## Monitoring Best Practices

### Dashboard Organization

#### Real-time Dashboards
- Current system status
- Active alerts
- Key performance indicators
- Recent error summary

#### Historical Trends
- Performance over time
- Error rate trends
- Resource utilization patterns
- Usage growth patterns

### Alert Management

#### Alert Fatigue Prevention
- Use appropriate alert thresholds
- Implement alert aggregation
- Set up alert dependencies
- Regular alert review and tuning

#### Escalation Procedures
- Tiered alerting (warning → critical)
- Automatic escalation after timeout
- On-call rotation schedules
- Clear runbook procedures

### Capacity Planning

#### Resource Forecasting
- Monitor usage patterns
- Predict resource needs
- Plan scaling events
- Budget for infrastructure growth

#### Performance Baselines
- Establish normal operating ranges
- Track seasonal variations
- Compare before/after deployments
- Set realistic performance targets

## Troubleshooting Performance Issues

### High Response Times

**Symptoms**: Queries taking longer than expected

**Investigation Steps**:
1. Check LLM provider latency
2. Profile tool execution times
3. Monitor database query performance
4. Check memory/CPU usage
5. Review concurrent connection count

**Common Solutions**:
- Implement response caching
- Optimize tool execution
- Scale infrastructure
- Review LLM provider selection

### High Error Rates

**Symptoms**: Increased error percentages

**Investigation Steps**:
1. Check error types and frequencies
2. Review application logs
3. Monitor external service health
4. Check resource exhaustion
5. Validate input data quality

**Common Solutions**:
- Improve error handling
- Add input validation
- Implement circuit breakers
- Scale resources

### Memory Leaks

**Symptoms**: Gradual memory increase over time

**Investigation Steps**:
1. Monitor memory usage trends
2. Profile memory allocations
3. Check for object reference cycles
4. Review session cleanup
5. Monitor garbage collection

**Common Solutions**:
- Fix reference cycles
- Implement proper cleanup
- Use weak references where appropriate
- Monitor session lifecycle

### Database Performance Issues

**Symptoms**: Slow database operations

**Investigation Steps**:
1. Monitor query execution times
2. Check connection pool status
3. Review query plans
4. Monitor database resource usage
5. Check for lock contention

**Common Solutions**:
- Optimize slow queries
- Add database indexes
- Scale database resources
- Implement query result caching

## Summary

Effective performance monitoring requires a multi-layered approach:

1. **Application Metrics**: Track business logic performance
2. **Infrastructure Metrics**: Monitor system resources
3. **External Dependencies**: Watch third-party services
4. **User Experience**: Measure end-to-end performance

Regular review of monitoring data enables proactive performance optimization and ensures reliable operation of the Personal Assistant Backend.
