# Performance Tuning Guide

This comprehensive guide covers performance optimization techniques, benchmarking strategies, and monitoring practices for the Personal Assistant system.

## Table of Contents

- [Performance Architecture](#performance-architecture)
- [Benchmarking and Profiling](#benchmarking-and-profiling)
- [Memory Optimization](#memory-optimization)
- [LLM Performance Tuning](#llm-performance-tuning)
- [Database and Storage Optimization](#database-and-storage-optimization)
- [Network and I/O Optimization](#network-and-io-optimization)
- [Caching Strategies](#caching-strategies)
- [Concurrent Processing](#concurrent-processing)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Performance Troubleshooting](#performance-troubleshooting)

## Performance Architecture

### Key Performance Metrics

Understanding and monitoring these metrics is crucial for performance optimization:

#### Response Time Metrics
- **P50 Latency**: Median response time (target: <2s for queries)
- **P95 Latency**: 95th percentile response time (target: <5s)
- **P99 Latency**: 99th percentile response time (target: <10s)

#### Throughput Metrics
- **Requests per Second (RPS)**: Total requests handled per second
- **Concurrent Users**: Number of simultaneous users supported
- **Queue Depth**: Number of queued requests

#### Resource Metrics
- **CPU Usage**: Should not exceed 70% sustained
- **Memory Usage**: Monitor for leaks and optimize heap usage
- **Disk I/O**: Critical for memory/vector storage operations
- **Network I/O**: Important for LLM API calls and file transfers

#### Error Metrics
- **Error Rate**: Should be <1% for production
- **Timeout Rate**: Requests exceeding timeout limits
- **Retry Rate**: Failed requests requiring retries

### Performance Baselines

Establish baselines for your specific use case:

```python
# performance_baselines.py
PERFORMANCE_BASELINES = {
    "development": {
        "p50_latency_ms": 1000,
        "p95_latency_ms": 3000,
        "p99_latency_ms": 5000,
        "rps": 10,
        "cpu_percent": 50,
        "memory_mb": 512
    },
    "staging": {
        "p50_latency_ms": 500,
        "p95_latency_ms": 1500,
        "p99_latency_ms": 3000,
        "rps": 50,
        "cpu_percent": 60,
        "memory_mb": 1024
    },
    "production": {
        "p50_latency_ms": 200,
        "p95_latency_ms": 1000,
        "p99_latency_ms": 2000,
        "rps": 100,
        "cpu_percent": 70,
        "memory_mb": 2048
    }
}
```

## Benchmarking and Profiling

### Automated Benchmarking

Create comprehensive benchmarks to measure system performance:

```python
# benchmark_suite.py
import asyncio
import time
import statistics
from typing import List, Dict, Any
import aiohttp
import psutil
import GPUtil

class PerformanceBenchmark:
    """Comprehensive performance benchmarking suite."""

    def __init__(self, base_url: str = "http://localhost:8765"):
        self.base_url = base_url
        self.results = {}

    async def run_full_benchmark(self) -> Dict[str, Any]:
        """Run complete performance benchmark suite."""
        print("🚀 Starting Performance Benchmark Suite")

        # System resource baseline
        baseline = self._capture_system_metrics()

        # Individual benchmarks
        self.results = {
            "timestamp": time.time(),
            "baseline": baseline,
            "latency_benchmark": await self._benchmark_latency(),
            "throughput_benchmark": await self._benchmark_throughput(),
            "memory_benchmark": await self._benchmark_memory_usage(),
            "concurrent_users_benchmark": await self._benchmark_concurrent_users(),
            "tool_execution_benchmark": await self._benchmark_tool_execution(),
            "llm_response_benchmark": await self._benchmark_llm_responses()
        }

        return self.results

    async def _benchmark_latency(self) -> Dict[str, Any]:
        """Benchmark response latency for different query types."""
        queries = [
            "Hello, how are you?",
            "What is the capital of France?",
            "Calculate 15 * 23 + 7",
            "Write a Python function to reverse a string",
            "Analyze this dataset: [1, 2, 3, 4, 5]" * 10  # Large query
        ]

        latencies = []
        async with aiohttp.ClientSession() as session:
            for query in queries:
                start_time = time.time()
                try:
                    async with session.post(
                        f"{self.base_url}/query",
                        json={"text": query},
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        await response.read()
                        latency = (time.time() - start_time) * 1000  # ms
                        latencies.append(latency)
                except Exception as e:
                    print(f"Query failed: {e}")
                    continue

        return {
            "samples": len(latencies),
            "p50_latency_ms": statistics.median(latencies) if latencies else 0,
            "p95_latency_ms": statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies) if latencies else 0,
            "p99_latency_ms": statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies) if latencies else 0,
            "min_latency_ms": min(latencies) if latencies else 0,
            "max_latency_ms": max(latencies) if latencies else 0,
            "avg_latency_ms": statistics.mean(latencies) if latencies else 0
        }

    async def _benchmark_throughput(self) -> Dict[str, Any]:
        """Benchmark maximum throughput under load."""
        async def worker(worker_id: int, results: List[float]):
            async with aiohttp.ClientSession() as session:
                for i in range(10):  # 10 requests per worker
                    start_time = time.time()
                    try:
                        async with session.post(
                            f"{self.base_url}/query",
                            json={"text": f"Benchmark query {i} from worker {worker_id}"},
                            timeout=aiohttp.ClientTimeout(total=10)
                        ) as response:
                            await response.read()
                            results.append(time.time() - start_time)
                    except Exception:
                        results.append(10.0)  # Timeout penalty

        # Run with increasing concurrency
        max_rps = 0
        optimal_concurrency = 0

        for concurrency in [1, 2, 5, 10, 20, 50]:
            print(f"Testing concurrency: {concurrency}")
            results = []
            tasks = [worker(i, results) for i in range(concurrency)]
            start_time = time.time()

            await asyncio.gather(*tasks, return_exceptions=True)

            total_time = time.time() - start_time
            total_requests = len(results)
            rps = total_requests / total_time

            if rps > max_rps and statistics.mean(results) < 5.0:  # Max 5s avg latency
                max_rps = rps
                optimal_concurrency = concurrency

        return {
            "max_rps": max_rps,
            "optimal_concurrency": optimal_concurrency,
            "tested_concurrencies": [1, 2, 5, 10, 20, 50]
        }

    async def _benchmark_memory_usage(self) -> Dict[str, Any]:
        """Benchmark memory usage patterns."""
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Run memory-intensive operations
        memory_samples = []

        async with aiohttp.ClientSession() as session:
            for i in range(20):
                await session.post(
                    f"{self.base_url}/query",
                    json={"text": f"Process large dataset {i}: " + "x" * 1000}
                )

                memory_samples.append(process.memory_info().rss / 1024 / 1024)
                await asyncio.sleep(0.1)  # Small delay between requests

        final_memory = process.memory_info().rss / 1024 / 1024
        memory_increase = final_memory - initial_memory

        return {
            "initial_memory_mb": initial_memory,
            "final_memory_mb": final_memory,
            "memory_increase_mb": memory_increase,
            "peak_memory_mb": max(memory_samples),
            "avg_memory_mb": statistics.mean(memory_samples),
            "memory_leak_detected": memory_increase > 50  # >50MB increase
        }

    async def _benchmark_concurrent_users(self) -> Dict[str, Any]:
        """Benchmark support for concurrent users."""
        async def simulate_user(user_id: int) -> Dict[str, float]:
            """Simulate a user session with multiple interactions."""
            session_times = []

            async with aiohttp.ClientSession() as session:
                for i in range(5):  # 5 interactions per user
                    start_time = time.time()

                    try:
                        async with session.post(
                            f"{self.base_url}/query",
                            json={"text": f"User {user_id} query {i}"},
                            timeout=aiohttp.ClientTimeout(total=15)
                        ) as response:
                            await response.read()
                            session_times.append(time.time() - start_time)
                    except Exception:
                        session_times.append(15.0)  # Timeout

                    await asyncio.sleep(0.5)  # Think time

            return {
                "user_id": user_id,
                "total_time": sum(session_times),
                "avg_response_time": statistics.mean(session_times),
                "success_rate": sum(1 for t in session_times if t < 10) / len(session_times)
            }

        # Test with different numbers of concurrent users
        user_counts = [1, 5, 10, 20, 50]
        results = {}

        for user_count in user_counts:
            print(f"Testing {user_count} concurrent users")
            start_time = time.time()

            user_tasks = [simulate_user(i) for i in range(user_count)]
            user_results = await asyncio.gather(*user_tasks, return_exceptions=True)

            total_time = time.time() - start_time

            successful_results = [r for r in user_results if isinstance(r, dict)]
            avg_response_time = statistics.mean(r["avg_response_time"] for r in successful_results)
            overall_success_rate = statistics.mean(r["success_rate"] for r in successful_results)

            results[user_count] = {
                "total_time": total_time,
                "avg_response_time": avg_response_time,
                "success_rate": overall_success_rate,
                "users_supported": len(successful_results)
            }

        return results

    async def _benchmark_tool_execution(self) -> Dict[str, Any]:
        """Benchmark tool execution performance."""
        tools_to_test = [
            {"name": "read_file", "params": {"file_path": "README.md"}},
            {"name": "list_directory", "params": {"path": "."}},
            {"name": "run_shell", "params": {"command": "echo 'test'"}},
        ]

        tool_results = {}

        async with aiohttp.ClientSession() as session:
            for tool in tools_to_test:
                latencies = []

                # Run tool multiple times
                for i in range(5):
                    start_time = time.time()
                    try:
                        async with session.post(
                            f"{self.base_url}/query",
                            json={"text": f"Execute {tool['name']} with params: {tool['params']}"},
                            timeout=aiohttp.ClientTimeout(total=20)
                        ) as response:
                            await response.read()
                            latencies.append(time.time() - start_time)
                    except Exception as e:
                        print(f"Tool {tool['name']} execution failed: {e}")
                        latencies.append(20.0)

                tool_results[tool['name']] = {
                    "avg_latency": statistics.mean(latencies),
                    "min_latency": min(latencies),
                    "max_latency": max(latencies),
                    "success_rate": sum(1 for l in latencies if l < 15) / len(latencies)
                }

        return tool_results

    async def _benchmark_llm_responses(self) -> Dict[str, Any]:
        """Benchmark LLM response characteristics."""
        query_sizes = [
            ("small", "Hello"),
            ("medium", "Explain how neural networks work in 200 words"),
            ("large", "Write a comprehensive guide about " + "machine learning " * 50)
        ]

        results = {}

        async with aiohttp.ClientSession() as session:
            for size_name, query in query_sizes:
                latencies = []
                response_sizes = []

                for i in range(3):  # 3 samples per size
                    start_time = time.time()
                    try:
                        async with session.post(
                            f"{self.base_url}/query",
                            json={"text": query},
                            timeout=aiohttp.ClientTimeout(total=60)
                        ) as response:
                            response_text = await response.text()
                            latency = time.time() - start_time
                            latencies.append(latency)
                            response_sizes.append(len(response_text))
                    except Exception as e:
                        print(f"LLM benchmark failed for {size_name}: {e}")
                        latencies.append(60.0)
                        response_sizes.append(0)

                results[size_name] = {
                    "avg_latency": statistics.mean(latencies),
                    "avg_response_size": statistics.mean(response_sizes),
                    "tokens_per_second": statistics.mean(response_sizes) / statistics.mean(latencies) if statistics.mean(latencies) > 0 else 0
                }

        return results

    def _capture_system_metrics(self) -> Dict[str, Any]:
        """Capture current system resource usage."""
        process = psutil.Process()

        return {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_mb": process.memory_info().rss / 1024 / 1024,
            "memory_percent": process.memory_percent(),
            "disk_usage_percent": psutil.disk_usage('/').percent,
            "network_connections": len(psutil.net_connections()),
            "gpu_info": self._get_gpu_info()
        }

    def _get_gpu_info(self) -> List[Dict[str, Any]]:
        """Get GPU information if available."""
        try:
            gpus = GPUtil.getGPUs()
            return [{
                "id": gpu.id,
                "name": gpu.name,
                "memory_used": gpu.memoryUsed,
                "memory_total": gpu.memoryTotal,
                "memory_percent": gpu.memoryUtil * 100,
                "temperature": gpu.temperature
            } for gpu in gpus]
        except Exception:
            return []

    def generate_report(self) -> str:
        """Generate human-readable performance report."""
        if not self.results:
            return "No benchmark results available. Run benchmark first."

        report = []
        report.append("# Performance Benchmark Report")
        report.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}")

        # System baseline
        baseline = self.results.get("baseline", {})
        report.append("\n## System Baseline")
        report.append(f"- CPU Usage: {baseline.get('cpu_percent', 0):.1f}%")
        report.append(f"- Memory Usage: {baseline.get('memory_mb', 0):.1f} MB")
        report.append(f"- GPU Available: {len(baseline.get('gpu_info', [])) > 0}")

        # Latency benchmark
        latency = self.results.get("latency_benchmark", {})
        report.append("\n## Latency Performance")
        report.append(f"- P50 Latency: {latency.get('p50_latency_ms', 0):.1f} ms")
        report.append(f"- P95 Latency: {latency.get('p95_latency_ms', 0):.1f} ms")
        report.append(f"- P99 Latency: {latency.get('p99_latency_ms', 0):.1f} ms")
        report.append(f"- Samples: {latency.get('samples', 0)}")

        # Throughput benchmark
        throughput = self.results.get("throughput_benchmark", {})
        report.append("\n## Throughput Performance")
        report.append(f"- Max RPS: {throughput.get('max_rps', 0):.1f}")
        report.append(f"- Optimal Concurrency: {throughput.get('optimal_concurrency', 0)}")

        # Memory benchmark
        memory = self.results.get("memory_benchmark", {})
        report.append("\n## Memory Performance")
        report.append(f"- Initial Memory: {memory.get('initial_memory_mb', 0):.1f} MB")
        report.append(f"- Final Memory: {memory.get('final_memory_mb', 0):.1f} MB")
        report.append(f"- Memory Increase: {memory.get('memory_increase_mb', 0):.1f} MB")
        report.append(f"- Memory Leak Detected: {memory.get('memory_leak_detected', False)}")

        # Concurrent users
        concurrent = self.results.get("concurrent_users_benchmark", {})
        report.append("\n## Concurrent Users Support")
        for user_count, data in concurrent.items():
            report.append(f"- {user_count} users: {data.get('avg_response_time', 0):.2f}s avg response, {data.get('success_rate', 0)*100:.1f}% success")

        return "\n".join(report)


# Usage example
async def main():
    benchmark = PerformanceBenchmark()
    results = await benchmark.run_full_benchmark()
    print(benchmark.generate_report())

if __name__ == "__main__":
    asyncio.run(main())
```

### Profiling Tools

Use these tools to identify performance bottlenecks:

```python
# profiler.py
import cProfile
import pstats
import io
from functools import wraps
import time
import memory_profiler
from typing import Callable, Any

def profile_function(func: Callable) -> Callable:
    """Decorator to profile function performance."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        pr = cProfile.Profile()
        pr.enable()

        start_time = time.time()
        result = await func(*args, **kwargs)
        end_time = time.time()

        pr.disable()

        s = io.StringIO()
        sortby = 'cumulative'
        ps = pstats.Stats(pr, stream=s).sort_stats(sortby)
        ps.print_stats()

        print(f"Function {func.__name__} took {end_time - start_time:.3f} seconds")
        print("Profile stats:")
        print(s.getvalue())

        return result
    return wrapper

def memory_profile_function(func: Callable) -> Callable:
    """Decorator to profile memory usage."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        print(f"Memory profiling {func.__name__}")

        # Get initial memory
        initial_memory = memory_profiler.memory_usage()[0]
        print(f"Initial memory: {initial_memory:.2f} MB")

        # Profile memory during execution
        mem_usage = memory_profiler.memory_usage(
            (await func(*args, **kwargs),),
            interval=0.1,
            timeout=None,
            max_usage=True,
            retval=True,
            stream=None
        )

        final_memory = memory_profiler.memory_usage()[0]
        peak_memory = mem_usage[1] if len(mem_usage) > 1 else final_memory

        print(f"Peak memory: {peak_memory:.2f} MB")
        print(f"Final memory: {final_memory:.2f} MB")
        print(f"Memory increase: {final_memory - initial_memory:.2f} MB")

        return mem_usage[0]
    return wrapper

class PerformanceProfiler:
    """Comprehensive performance profiling tool."""

    def __init__(self):
        self.metrics = {}

    def start_profiling(self, name: str):
        """Start profiling a code section."""
        self.metrics[name] = {
            "start_time": time.time(),
            "start_memory": memory_profiler.memory_usage()[0],
            "cpu_start": time.process_time()
        }

    def end_profiling(self, name: str) -> Dict[str, float]:
        """End profiling and return metrics."""
        if name not in self.metrics:
            return {}

        start_data = self.metrics[name]
        end_time = time.time()
        end_memory = memory_profiler.memory_usage()[0]
        end_cpu = time.process_time()

        metrics = {
            "duration": end_time - start_data["start_time"],
            "memory_increase": end_memory - start_data["start_memory"],
            "cpu_time": end_cpu - start_data["cpu_start"],
            "cpu_percent": (end_cpu - start_data["cpu_start"]) / (end_time - start_data["start_time"]) * 100
        }

        print(f"Profile {name}:")
        print(".3f")
        print(".2f")
        print(".3f")
        print(".1f")

        return metrics

    async def profile_async_function(self, func: Callable, *args, **kwargs) -> Dict[str, Any]:
        """Profile an async function comprehensively."""
        profiler = cProfile.Profile()
        profiler.enable()

        mem_before = memory_profiler.memory_usage()[0]
        time_before = time.time()
        cpu_before = time.process_time()

        try:
            result = await func(*args, **kwargs)
        finally:
            profiler.disable()

        mem_after = memory_profiler.memory_usage()[0]
        time_after = time.time()
        cpu_after = time.process_time()

        # Get profile stats
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')

        # Extract top 10 functions
        top_functions = []
        for func_stat in stats.funct_stats[:10]:
            top_functions.append({
                "function": func_stat[0],
                "calls": func_stat[1],
                "total_time": func_stat[2],
                "cumulative_time": func_stat[3]
            })

        return {
            "execution_time": time_after - time_before,
            "cpu_time": cpu_after - cpu_before,
            "memory_increase": mem_after - mem_before,
            "top_functions": top_functions
        }
```

## Memory Optimization

### Memory Leak Detection

```python
# memory_monitor.py
import gc
import psutil
import tracemalloc
from typing import Dict, List, Any
import weakref
import threading
import time

class MemoryMonitor:
    """Advanced memory monitoring and leak detection."""

    def __init__(self):
        self.process = psutil.Process()
        self.tracemalloc_enabled = False
        self.snapshots = []
        self.object_refs = weakref.WeakSet()

    def enable_tracemalloc(self):
        """Enable tracemalloc for detailed memory tracing."""
        if not tracemalloc.is_tracing():
            tracemalloc.start()
            self.tracemalloc_enabled = True

    def disable_tracemalloc(self):
        """Disable tracemalloc."""
        if tracemalloc.is_tracing():
            tracemalloc.stop()
            self.tracemalloc_enabled = False

    def take_snapshot(self, label: str = "") -> Dict[str, Any]:
        """Take a memory snapshot."""
        snapshot = {
            "timestamp": time.time(),
            "label": label,
            "rss_mb": self.process.memory_info().rss / 1024 / 1024,
            "vms_mb": self.process.memory_info().vms / 1024 / 1024,
            "cpu_percent": self.process.cpu_percent(),
            "num_threads": threading.active_count()
        }

        if self.tracemalloc_enabled:
            current, peak = tracemalloc.get_traced_memory()
            snapshot["tracemalloc_current"] = current / 1024 / 1024
            snapshot["tracemalloc_peak"] = peak / 1024 / 1024

            # Get top memory allocators
            snapshot["top_allocators"] = tracemalloc.get_tracemalloc_memory()

        self.snapshots.append(snapshot)
        return snapshot

    def get_memory_stats(self) -> Dict[str, Any]:
        """Get comprehensive memory statistics."""
        stats = {
            "current_usage": {
                "rss_mb": self.process.memory_info().rss / 1024 / 1024,
                "vms_mb": self.process.memory_info().vms / 1024 / 1024,
                "cpu_percent": self.process.cpu_percent()
            },
            "memory_info": dict(self.process.memory_info()._asdict()),
            "memory_percent": self.process.memory_percent(),
            "num_fds": self.process.num_fds() if hasattr(self.process, 'num_fds') else None
        }

        if self.snapshots:
            initial = self.snapshots[0]
            current = self.snapshots[-1]
            stats["trend"] = {
                "memory_growth_mb": current["rss_mb"] - initial["rss_mb"],
                "duration_hours": (current["timestamp"] - initial["timestamp"]) / 3600
            }

        return stats

    def detect_memory_leaks(self) -> List[Dict[str, Any]]:
        """Detect potential memory leaks."""
        leaks = []

        if len(self.snapshots) < 2:
            return leaks

        # Check for continuous memory growth
        recent_snapshots = self.snapshots[-10:]  # Last 10 snapshots
        if len(recent_snapshots) >= 5:
            memory_values = [s["rss_mb"] for s in recent_snapshots]
            growth_rate = (memory_values[-1] - memory_values[0]) / len(memory_values)

            if growth_rate > 10:  # Growing more than 10MB per snapshot
                leaks.append({
                    "type": "continuous_growth",
                    "severity": "high",
                    "description": ".1f",
                    "growth_rate_mb_per_snapshot": growth_rate,
                    "recommendation": "Check for object accumulation or circular references"
                })

        # Check for large memory spikes
        for i, snapshot in enumerate(self.snapshots[1:], 1):
            prev_snapshot = self.snapshots[i-1]
            growth = snapshot["rss_mb"] - prev_snapshot["rss_mb"]

            if growth > 100:  # Sudden 100MB increase
                leaks.append({
                    "type": "memory_spike",
                    "severity": "medium",
                    "description": ".1f",
                    "spike_size_mb": growth,
                    "timestamp": snapshot["timestamp"],
                    "recommendation": "Investigate memory allocation around this time"
                })

        return leaks

    def analyze_object_growth(self) -> Dict[str, Any]:
        """Analyze object count growth patterns."""
        gc.collect()  # Force garbage collection

        object_counts = {}
        for obj in gc.get_objects():
            obj_type = type(obj).__name__
            object_counts[obj_type] = object_counts.get(obj_type, 0) + 1

        # Get top object types
        top_objects = sorted(object_counts.items(), key=lambda x: x[1], reverse=True)[:20]

        return {
            "total_objects": len(gc.get_objects()),
            "object_types": dict(top_objects),
            "gc_stats": gc.get_stats(),
            "potential_issues": self._analyze_object_counts(object_counts)
        }

    def _analyze_object_counts(self, object_counts: Dict[str, int]) -> List[str]:
        """Analyze object counts for potential issues."""
        issues = []

        # Check for excessive dict/list accumulation
        if object_counts.get("dict", 0) > 10000:
            issues.append("High number of dict objects - possible cache accumulation")
        if object_counts.get("list", 0) > 50000:
            issues.append("High number of list objects - possible data accumulation")

        # Check for unclosed resources
        if object_counts.get("file", 0) > 100:
            issues.append("High number of file objects - possible unclosed files")

        return issues

    def monitor_memory_usage(self, interval_seconds: int = 60, duration_minutes: int = 60):
        """Continuously monitor memory usage."""
        import asyncio

        async def monitoring_loop():
            end_time = time.time() + (duration_minutes * 60)

            while time.time() < end_time:
                self.take_snapshot(f"auto_{int(time.time())}")

                leaks = self.detect_memory_leaks()
                if leaks:
                    print("🚨 Memory issues detected:")
                    for leak in leaks:
                        print(f"  {leak['type']}: {leak['description']}")

                stats = self.analyze_object_growth()
                if stats["potential_issues"]:
                    print("⚠️  Object accumulation detected:")
                    for issue in stats["potential_issues"]:
                        print(f"  {issue}")

                await asyncio.sleep(interval_seconds)

        return monitoring_loop()
```

### Memory Pool Optimization

```python
# memory_pool.py
import threading
from typing import Any, Dict, List, Optional
import weakref

class MemoryPool:
    """Memory pool for reusable objects to reduce allocation overhead."""

    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.pool = []
        self.lock = threading.Lock()
        self.created_objects = 0

    def acquire(self) -> Any:
        """Acquire an object from the pool."""
        with self.lock:
            if self.pool:
                return self.pool.pop()
            else:
                self.created_objects += 1
                return self._create_object()

    def release(self, obj: Any) -> None:
        """Return an object to the pool."""
        with self.lock:
            if len(self.pool) < self.max_size and self._is_valid(obj):
                self._reset_object(obj)
                self.pool.append(obj)
            else:
                self._destroy_object(obj)

    def _create_object(self) -> Any:
        """Create a new object (override in subclass)."""
        raise NotImplementedError

    def _reset_object(self, obj: Any) -> None:
        """Reset object state for reuse (override in subclass)."""
        pass

    def _is_valid(self, obj: Any) -> bool:
        """Check if object is valid for reuse (override in subclass)."""
        return True

    def _destroy_object(self, obj: Any) -> None:
        """Destroy an object (override in subclass)."""
        pass

    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics."""
        with self.lock:
            return {
                "pool_size": len(self.pool),
                "max_size": self.max_size,
                "created_objects": self.created_objects,
                "utilization_percent": (len(self.pool) / self.max_size) * 100
            }

class LLMRequestPool(MemoryPool):
    """Memory pool for LLM request objects."""

    def __init__(self, max_size: int = 100):
        super().__init__(max_size)
        self.request_template = {
            "model": None,
            "messages": [],
            "temperature": 0.7,
            "max_tokens": None,
            "tools": None
        }

    def _create_object(self) -> Dict[str, Any]:
        """Create a new LLM request object."""
        return self.request_template.copy()

    def _reset_object(self, obj: Dict[str, Any]) -> None:
        """Reset request object for reuse."""
        obj.clear()
        obj.update(self.request_template)

    def _is_valid(self, obj: Any) -> bool:
        """Check if request object is valid."""
        return isinstance(obj, dict) and "messages" in obj

class VectorPool(MemoryPool):
    """Memory pool for vector operations."""

    def __init__(self, vector_dim: int = 768, max_size: int = 500):
        super().__init__(max_size)
        self.vector_dim = vector_dim

    def _create_object(self) -> List[float]:
        """Create a new vector."""
        return [0.0] * self.vector_dim

    def _reset_object(self, obj: List[float]) -> None:
        """Reset vector for reuse."""
        for i in range(len(obj)):
            obj[i] = 0.0

    def _is_valid(self, obj: Any) -> bool:
        """Check if vector is valid."""
        return isinstance(obj, list) and len(obj) == self.vector_dim
```

## LLM Performance Tuning

### Model Selection and Configuration

```yaml
# Optimized LLM configuration
llm:
  # Model selection based on use case
  models:
    # Fast model for simple queries
    fast_model:
      provider: "openai"
      model: "gpt-3.5-turbo"
      temperature: 0.3
      max_tokens: 1000
      use_case: "simple_queries"

    # Quality model for complex tasks
    quality_model:
      provider: "anthropic"
      model: "claude-3-sonnet"
      temperature: 0.7
      max_tokens: 4000
      use_case: "complex_reasoning"

    # Local model for offline/fallback
    local_model:
      provider: "local"
      model: "llama-2-13b-chat"
      temperature: 0.6
      max_tokens: 2000
      use_case: "offline_fallback"

  # Dynamic model selection
  routing:
    strategy: "adaptive"
    rules:
      - condition: "len(query) < 100 and not contains_tools"
        model: "fast_model"
      - condition: "complexity_score > 0.7 or contains_tools"
        model: "quality_model"
      - condition: "network_unavailable"
        model: "local_model"

  # Performance optimizations
  optimizations:
    # Response caching
    caching:
      enabled: true
      ttl_seconds: 3600
      similarity_threshold: 0.95
      max_cache_size_mb: 500

    # Request batching
    batching:
      enabled: true
      max_batch_size: 10
      batch_timeout_ms: 100

    # Connection pooling
    connections:
      max_connections: 20
      max_keepalive: 10
      keepalive_timeout: 30
```

### Prompt Optimization

```python
# prompt_optimizer.py
from typing import List, Dict, Any, Optional
import re

class PromptOptimizer:
    """Optimize prompts for better LLM performance and cost efficiency."""

    def __init__(self):
        self.optimization_rules = [
            self._remove_redundancy,
            self._compress_examples,
            self._prioritize_information,
            self._use_concise_language,
            self._structure_information
        ]

    def optimize_prompt(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Optimize a prompt for better performance."""
        optimized = prompt

        for rule in self.optimization_rules:
            optimized = rule(optimized, context)

        return optimized

    def _remove_redundancy(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Remove redundant information from prompts."""
        # Remove duplicate sentences
        sentences = prompt.split('.')
        unique_sentences = []
        seen = set()

        for sentence in sentences:
            cleaned = sentence.strip()
            if cleaned and cleaned.lower() not in seen:
                unique_sentences.append(cleaned)
                seen.add(cleaned.lower())

        return '. '.join(unique_sentences)

    def _compress_examples(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Compress lengthy examples in prompts."""
        # Find example sections
        example_pattern = r'(?:Example|Ex\.?\s*\d+|Input|Output):(.+?)(?=Example|Ex\.?\s*\d+|Input|Output|$)'
        matches = re.findall(example_pattern, prompt, re.DOTALL | re.IGNORECASE)

        compressed_examples = []
        for example in matches:
            # Keep only essential parts of examples
            compressed = self._compress_text(example.strip())
            compressed_examples.append(compressed)

        # Replace examples in prompt
        for i, compressed in enumerate(compressed_examples):
            if i < len(matches):
                prompt = prompt.replace(matches[i], compressed)

        return prompt

    def _prioritize_information(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Prioritize important information in prompts."""
        # Move critical information to the beginning
        priority_keywords = [
            "must", "required", "important", "critical",
            "do not", "never", "avoid", "prohibited"
        ]

        lines = prompt.split('\n')
        priority_lines = []
        normal_lines = []

        for line in lines:
            if any(keyword in line.lower() for keyword in priority_keywords):
                priority_lines.append(line)
            else:
                normal_lines.append(line)

        return '\n'.join(priority_lines + normal_lines)

    def _use_concise_language(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Use more concise language in prompts."""
        # Word replacements for conciseness
        replacements = {
            "please ": "",
            "could you ": "",
            "would you ": "",
            "can you ": "",
            "I would like you to ": "",
            "I want you to ": "",
            "it would be great if you could ": "",
            "if possible, ": "",
        }

        result = prompt
        for old, new in replacements.items():
            result = result.replace(old, new)

        return result

    def _structure_information(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Structure information for better LLM processing."""
        # Add clear sections if not present
        sections = ["Context", "Task", "Requirements", "Examples", "Output Format"]

        structured_prompt = prompt

        # Add section headers where appropriate
        if "Context:" not in prompt and len(prompt) > 200:
            # Try to identify context section
            context_end = min(500, len(prompt) // 3)
            context_part = prompt[:context_end]
            rest_part = prompt[context_end:]
            structured_prompt = f"Context:\n{context_part}\n\nTask:\n{rest_part}"

        return structured_prompt

    def _compress_text(self, text: str, max_length: int = 200) -> str:
        """Compress text while preserving meaning."""
        if len(text) <= max_length:
            return text

        # Simple compression: keep first and last parts
        keep_chars = max_length // 2
        return text[:keep_chars] + " ... " + text[-keep_chars:]

    def estimate_tokens(self, prompt: str) -> int:
        """Estimate token count for a prompt."""
        # Rough estimation: 1 token ≈ 4 characters for English text
        return len(prompt) // 4

    def optimize_for_cost(self, prompt: str, target_tokens: Optional[int] = None) -> str:
        """Optimize prompt to reduce token usage."""
        optimized = self.optimize_prompt(prompt)

        if target_tokens:
            current_tokens = self.estimate_tokens(optimized)
            if current_tokens > target_tokens:
                # Aggressive compression
                compression_ratio = target_tokens / current_tokens
                max_length = int(len(optimized) * compression_ratio)
                optimized = self._compress_text(optimized, max_length)

        return optimized

    def optimize_for_quality(self, prompt: str) -> str:
        """Optimize prompt for higher quality responses."""
        # Add quality-enhancing elements
        if "step by step" not in prompt.lower():
            prompt += "\n\nPlease reason step by step and provide a detailed explanation."

        if "format" not in prompt.lower():
            prompt += "\n\nFormat your response clearly with sections and bullet points where appropriate."

        return prompt
```

## Database and Storage Optimization

### Vector Database Optimization

```python
# vector_db_optimizer.py
from typing import List, Dict, Any, Optional
import numpy as np
import faiss
import hnswlib
from abc import ABC, abstractmethod

class VectorIndexOptimizer(ABC):
    """Abstract base class for vector index optimization."""

    @abstractmethod
    def build_index(self, vectors: np.ndarray) -> Any:
        """Build optimized index for vectors."""
        pass

    @abstractmethod
    def search(self, index: Any, query_vector: np.ndarray, k: int) -> List[int]:
        """Search index for k nearest neighbors."""
        pass

    @abstractmethod
    def optimize_index(self, index: Any, vectors: np.ndarray) -> Any:
        """Optimize existing index."""
        pass

class FAISSOptimizer(VectorIndexOptimizer):
    """FAISS-based vector index optimization."""

    def __init__(self, dimension: int = 768):
        self.dimension = dimension

    def build_index(self, vectors: np.ndarray) -> faiss.Index:
        """Build FAISS index with optimizations."""
        # Choose optimal index type based on data size
        n_vectors = len(vectors)

        if n_vectors < 10000:
            # Small dataset: exact search with L2
            index = faiss.IndexFlatL2(self.dimension)
        elif n_vectors < 100000:
            # Medium dataset: IVF with PQ
            nlist = min(100, max(4, int(np.sqrt(n_vectors))))
            quantizer = faiss.IndexFlatL2(self.dimension)
            index = faiss.IndexIVFPQ(quantizer, self.dimension, nlist, 8, 8)
        else:
            # Large dataset: HNSW
            index = faiss.IndexHNSWFlat(self.dimension, 32)
            index.hnsw.efConstruction = 200

        # Train and add vectors
        if not index.is_trained:
            index.train(vectors)

        index.add(vectors)

        return index

    def search(self, index: faiss.Index, query_vector: np.ndarray, k: int) -> List[int]:
        """Optimized FAISS search."""
        # Set search parameters for better performance
        if hasattr(index, 'nprobe'):
            index.nprobe = min(10, index.nlist)

        if hasattr(index, 'hnsw'):
            index.hnsw.efSearch = max(k * 2, 64)

        distances, indices = index.search(query_vector.reshape(1, -1), k)
        return indices[0].tolist()

    def optimize_index(self, index: faiss.Index, vectors: np.ndarray) -> faiss.Index:
        """Optimize FAISS index."""
        # Rebuild with better parameters
        return self.build_index(vectors)

class HNSWOptimizer(VectorIndexOptimizer):
    """HNSW-based vector index optimization."""

    def __init__(self, dimension: int = 768, max_elements: int = 100000):
        self.dimension = dimension
        self.max_elements = max_elements

    def build_index(self, vectors: np.ndarray) -> hnswlib.Index:
        """Build HNSW index with optimizations."""
        # Initialize index
        index = hnswlib.Index(space='l2', dim=self.dimension)
        index.init_index(max_elements=self.max_elements, ef_construction=200, M=16)

        # Add vectors in batches for better performance
        batch_size = 10000
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            index.add_items(batch, ids=list(range(i, min(i + batch_size, len(vectors)))))

        # Optimize for search
        index.set_ef(64)  # Default ef for search

        return index

    def search(self, index: hnswlib.Index, query_vector: np.ndarray, k: int) -> List[int]:
        """Optimized HNSW search."""
        # Adjust ef based on k for optimal performance
        index.set_ef(max(k * 2, 64))

        labels, distances = index.knn_query(query_vector.reshape(1, -1), k=k)
        return labels[0].tolist()

    def optimize_index(self, index: hnswlib.Index, vectors: np.ndarray) -> hnswlib.Index:
        """Optimize HNSW index."""
        # Rebuild with better parameters based on data
        n_vectors = len(vectors)
        optimal_M = min(64, max(16, int(np.log2(n_vectors) * 2)))

        new_index = hnswlib.Index(space='l2', dim=self.dimension)
        new_index.init_index(
            max_elements=n_vectors,
            ef_construction=min(400, n_vectors // 10),
            M=optimal_M
        )

        new_index.add_items(vectors)
        new_index.set_ef(128)

        return new_index

class VectorDatabaseOptimizer:
    """High-level vector database optimizer."""

    def __init__(self, dimension: int = 768):
        self.dimension = dimension
        self.optimizers = {
            'faiss': FAISSOptimizer(dimension),
            'hnsw': HNSWOptimizer(dimension)
        }

    def recommend_index_type(self, n_vectors: int, search_performance_priority: str = "balanced") -> str:
        """Recommend optimal index type based on dataset characteristics."""

        if search_performance_priority == "speed":
            return "faiss" if n_vectors < 100000 else "hnsw"
        elif search_performance_priority == "accuracy":
            return "faiss"  # Exact search for small datasets
        else:  # balanced
            if n_vectors < 10000:
                return "faiss"  # Exact search is fine
            elif n_vectors < 100000:
                return "faiss"  # IVF is good balance
            else:
                return "hnsw"  # HNSW for large datasets

    def optimize_database(self, vectors: np.ndarray,
                         index_type: Optional[str] = None,
                         performance_goal: str = "balanced") -> Dict[str, Any]:
        """Optimize vector database configuration."""

        n_vectors = len(vectors)

        if not index_type:
            index_type = self.recommend_index_type(n_vectors, performance_goal)

        optimizer = self.optimizers[index_type]
        index = optimizer.build_index(vectors)

        # Benchmark performance
        benchmark_results = self._benchmark_index(index, optimizer, vectors)

        return {
            "index_type": index_type,
            "index": index,
            "configuration": self._get_optimal_config(n_vectors, index_type),
            "benchmark": benchmark_results,
            "recommendations": self._generate_recommendations(benchmark_results, n_vectors)
        }

    def _benchmark_index(self, index: Any, optimizer: VectorIndexOptimizer,
                        vectors: np.ndarray, n_queries: int = 100) -> Dict[str, Any]:
        """Benchmark index performance."""

        # Generate random query vectors
        np.random.seed(42)
        query_indices = np.random.choice(len(vectors), n_queries, replace=False)
        query_vectors = vectors[query_indices]

        import time

        # Benchmark search performance
        start_time = time.time()
        results = []
        for query_vector in query_vectors:
            result = optimizer.search(index, query_vector, k=10)
            results.append(result)

        search_time = time.time() - start_time

        return {
            "total_search_time": search_time,
            "avg_search_time": search_time / n_queries,
            "queries_per_second": n_queries / search_time,
            "avg_results_returned": sum(len(r) for r in results) / len(results)
        }

    def _get_optimal_config(self, n_vectors: int, index_type: str) -> Dict[str, Any]:
        """Get optimal configuration for given parameters."""

        if index_type == "faiss":
            if n_vectors < 10000:
                return {"index_type": "IndexFlatL2", "parameters": {}}
            elif n_vectors < 100000:
                nlist = min(100, max(4, int(np.sqrt(n_vectors))))
                return {
                    "index_type": "IndexIVFPQ",
                    "parameters": {"nlist": nlist, "m": 8, "nbits": 8}
                }
            else:
                return {
                    "index_type": "IndexHNSWFlat",
                    "parameters": {"M": 32, "efConstruction": 200}
                }
        elif index_type == "hnsw":
            optimal_M = min(64, max(16, int(np.log2(n_vectors) * 2)))
            return {
                "space": "l2",
                "M": optimal_M,
                "ef_construction": min(400, n_vectors // 10),
                "ef_search": 64
            }

        return {}

    def _generate_recommendations(self, benchmark: Dict[str, Any], n_vectors: int) -> List[str]:
        """Generate optimization recommendations."""

        recommendations = []

        qps = benchmark.get("queries_per_second", 0)

        if qps < 100:
            recommendations.append("Consider using a faster index type or optimizing parameters")
        if qps > 1000:
            recommendations.append("Performance is excellent - consider adding more caching")

        if n_vectors > 1000000:
            recommendations.append("For very large datasets, consider sharding the index")

        avg_search_time = benchmark.get("avg_search_time", 0)
        if avg_search_time > 0.1:  # 100ms
            recommendations.append("Search performance could be improved - consider index optimization")

        return recommendations
```

## Network and I/O Optimization

### Connection Pooling

```python
# connection_pool.py
import asyncio
import aiohttp
from typing import Dict, List, Optional, Any
import time
import threading

class OptimizedConnectionPool:
    """Optimized connection pool for external API calls."""

    def __init__(self,
                 max_connections: int = 20,
                 max_keepalive: int = 10,
                 keepalive_timeout: int = 30,
                 timeout: aiohttp.ClientTimeout = None):
        self.max_connections = max_connections
        self.max_keepalive = max_keepalive
        self.keepalive_timeout = keepalive_timeout

        self.timeout = timeout or aiohttp.ClientTimeout(
            total=30,
            connect=10,
            sock_read=10,
            sock_connect=10
        )

        self._lock = asyncio.Lock()
        self._sessions: Dict[str, aiohttp.ClientSession] = {}
        self._session_usage: Dict[str, int] = {}
        self._last_used: Dict[str, float] = {}

    async def get_session(self, base_url: str) -> aiohttp.ClientSession:
        """Get or create a session for the given base URL."""
        async with self._lock:
            if base_url not in self._sessions:
                connector = aiohttp.TCPConnector(
                    limit=self.max_connections,
                    limit_per_host=self.max_connections,
                    ttl_dns_cache=300,
                    use_dns_cache=True,
                    keepalive_timeout=self.keepalive_timeout,
                    enable_cleanup_closed=True
                )

                self._sessions[base_url] = aiohttp.ClientSession(
                    base_url=base_url,
                    connector=connector,
                    timeout=self.timeout
                )
                self._session_usage[base_url] = 0

            self._session_usage[base_url] += 1
            self._last_used[base_url] = time.time()

            return self._sessions[base_url]

    async def release_session(self, base_url: str):
        """Release a session (decrement usage counter)."""
        async with self._lock:
            if base_url in self._session_usage:
                self._session_usage[base_url] -= 1

    async def cleanup_idle_sessions(self, max_idle_time: int = 300):
        """Clean up sessions that haven't been used recently."""
        async with self._lock:
            current_time = time.time()
            to_remove = []

            for base_url, last_used in self._last_used.items():
                if current_time - last_used > max_idle_time:
                    to_remove.append(base_url)

            for base_url in to_remove:
                if self._session_usage.get(base_url, 0) == 0:
                    session = self._sessions.pop(base_url, None)
                    if session:
                        await session.close()
                    self._session_usage.pop(base_url, None)
                    self._last_used.pop(base_url, None)

    async def close_all(self):
        """Close all sessions."""
        async with self._lock:
            for session in self._sessions.values():
                await session.close()
            self._sessions.clear()
            self._session_usage.clear()
            self._last_used.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics."""
        return {
            "active_sessions": len(self._sessions),
            "total_usage": sum(self._session_usage.values()),
            "max_connections": self.max_connections,
            "sessions_by_url": dict(self._session_usage)
        }

class LLMConnectionPool(OptimizedConnectionPool):
    """Specialized connection pool for LLM API calls."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.provider_configs = {
            "openai": {
                "base_url": "https://api.openai.com/v1",
                "headers": {"Authorization": "Bearer ${OPENAI_API_KEY}"}
            },
            "anthropic": {
                "base_url": "https://api.anthropic.com",
                "headers": {"x-api-key": "${ANTHROPIC_API_KEY}"}
            }
        }

    async def call_llm_api(self, provider: str, endpoint: str,
                          payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make optimized LLM API call."""
        config = self.provider_configs.get(provider)
        if not config:
            raise ValueError(f"Unknown provider: {provider}")

        session = await self.get_session(config["base_url"])

        try:
            headers = config.get("headers", {}).copy()
            headers["Content-Type"] = "application/json"

            # Environment variable substitution
            for key, value in headers.items():
                if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                    env_var = value[2:-1]
                    headers[key] = os.getenv(env_var, "")

            async with session.post(endpoint, json=payload, headers=headers) as response:
                return {
                    "status": response.status,
                    "headers": dict(response.headers),
                    "data": await response.json() if response.content_type == 'application/json' else await response.text()
                }
        finally:
            await self.release_session(config["base_url"])

    async def health_check(self, provider: str) -> bool:
        """Check if LLM provider is healthy."""
        try:
            config = self.provider_configs.get(provider)
            if not config:
                return False

            session = await self.get_session(config["base_url"])
            async with session.get("/health") as response:
                return response.status == 200
        except Exception:
            return False
        finally:
            await self.release_session(config["base_url"])
```

## Caching Strategies

### Multi-Level Caching

```python
# multi_level_cache.py
import asyncio
import pickle
import hashlib
from typing import Any, Dict, Optional, Callable
import time
from abc import ABC, abstractmethod

class CacheBackend(ABC):
    """Abstract base class for cache backends."""

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        pass

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        pass

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete value from cache."""
        pass

    @abstractmethod
    async def clear(self) -> None:
        """Clear all cache entries."""
        pass

class MemoryCache(CacheBackend):
    """In-memory LRU cache."""

    def __init__(self, max_size: int = 1000, default_ttl: int = 3600):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.access_order: List[str] = []

    async def get(self, key: str) -> Optional[Any]:
        """Get value from memory cache."""
        if key in self.cache:
            entry = self.cache[key]
            if time.time() < entry["expires"]:
                # Update access order for LRU
                if key in self.access_order:
                    self.access_order.remove(key)
                self.access_order.append(key)
                return entry["value"]
            else:
                # Expired entry
                del self.cache[key]
                if key in self.access_order:
                    self.access_order.remove(key)
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in memory cache."""
        expires = time.time() + (ttl or self.default_ttl)

        # Evict if at capacity
        if len(self.cache) >= self.max_size and key not in self.cache:
            oldest_key = self.access_order.pop(0)
            del self.cache[oldest_key]

        self.cache[key] = {"value": value, "expires": expires}

        # Update access order
        if key in self.access_order:
            self.access_order.remove(key)
        self.access_order.append(key)

    async def delete(self, key: str) -> None:
        """Delete value from memory cache."""
        if key in self.cache:
            del self.cache[key]
        if key in self.access_order:
            self.access_order.remove(key)

    async def clear(self) -> None:
        """Clear memory cache."""
        self.cache.clear()
        self.access_order.clear()

class RedisCache(CacheBackend):
    """Redis-based distributed cache."""

    def __init__(self, redis_client, default_ttl: int = 3600, key_prefix: str = "pa:"):
        self.redis = redis_client
        self.default_ttl = default_ttl
        self.key_prefix = key_prefix

    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis cache."""
        full_key = f"{self.key_prefix}{key}"
        try:
            data = await self.redis.get(full_key)
            if data:
                return pickle.loads(data)
        except Exception:
            pass
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in Redis cache."""
        full_key = f"{self.key_prefix}{key}"
        try:
            data = pickle.dumps(value)
            await self.redis.setex(full_key, ttl or self.default_ttl, data)
        except Exception:
            pass

    async def delete(self, key: str) -> None:
        """Delete value from Redis cache."""
        full_key = f"{self.key_prefix}{key}"
        try:
            await self.redis.delete(full_key)
        except Exception:
            pass

    async def clear(self) -> None:
        """Clear Redis cache (use with caution)."""
        try:
            keys = await self.redis.keys(f"{self.key_prefix}*")
            if keys:
                await self.redis.delete(*keys)
        except Exception:
            pass

class MultiLevelCache:
    """Multi-level caching with L1 (memory) and L2 (Redis) caches."""

    def __init__(self, l1_cache: MemoryCache, l2_cache: Optional[RedisCache] = None):
        self.l1_cache = l1_cache
        self.l2_cache = l2_cache
        self.hit_stats = {"l1_hits": 0, "l2_hits": 0, "misses": 0}

    async def get(self, key: str) -> Optional[Any]:
        """Get value from multi-level cache."""
        # Try L1 cache first
        value = await self.l1_cache.get(key)
        if value is not None:
            self.hit_stats["l1_hits"] += 1
            return value

        # Try L2 cache if available
        if self.l2_cache:
            value = await self.l2_cache.get(key)
            if value is not None:
                self.hit_stats["l2_hits"] += 1
                # Populate L1 cache
                await self.l1_cache.set(key, value)
                return value

        # Cache miss
        self.hit_stats["misses"] += 1
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in multi-level cache."""
        # Set in both caches
        await self.l1_cache.set(key, value, ttl)
        if self.l2_cache:
            await self.l2_cache.set(key, value, ttl)

    async def delete(self, key: str) -> None:
        """Delete value from multi-level cache."""
        await self.l1_cache.delete(key)
        if self.l2_cache:
            await self.l2_cache.delete(key)

    async def clear(self) -> None:
        """Clear all cache levels."""
        await self.l1_cache.clear()
        if self.l2_cache:
            await self.l2_cache.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics."""
        total_requests = sum(self.hit_stats.values())
        if total_requests == 0:
            hit_rate = 0
        else:
            hit_rate = (self.hit_stats["l1_hits"] + self.hit_stats["l2_hits"]) / total_requests

        return {
            "hit_stats": self.hit_stats.copy(),
            "total_requests": total_requests,
            "hit_rate": hit_rate,
            "l1_cache_stats": await self.l1_cache.get_stats() if hasattr(self.l1_cache, 'get_stats') else {},
            "l2_cache_stats": await self.l2_cache.get_stats() if self.l2_cache and hasattr(self.l2_cache, 'get_stats') else {}
        }

class SmartCache:
    """Intelligent caching with automatic key generation and invalidation."""

    def __init__(self, cache: MultiLevelCache):
        self.cache = cache
        self.function_cache_info = {}

    def cached(self, ttl: Optional[int] = None, key_func: Optional[Callable] = None):
        """Decorator for automatic function result caching."""
        def decorator(func: Callable):
            async def wrapper(*args, **kwargs):
                # Generate cache key
                if key_func:
                    key = key_func(*args, **kwargs)
                else:
                    # Default key generation
                    key_data = f"{func.__module__}.{func.__name__}:{args}:{kwargs}"
                    key = hashlib.md5(key_data.encode()).hexdigest()

                # Try cache first
                cached_result = await self.cache.get(key)
                if cached_result is not None:
                    return cached_result

                # Execute function
                result = await func(*args, **kwargs)

                # Cache result
                await self.cache.set(key, result, ttl)

                # Store cache info for invalidation
                self.function_cache_info[func.__name__] = key

                return result

            return wrapper
        return decorator

    async def invalidate_function_cache(self, function_name: str) -> None:
        """Invalidate cache for a specific function."""
        if function_name in self.function_cache_info:
            key = self.function_cache_info[function_name]
            await self.cache.delete(key)
            del self.function_cache_info[function_name]

    async def invalidate_pattern(self, pattern: str) -> None:
        """Invalidate cache keys matching a pattern."""
        # This would require more sophisticated key tracking
        # For now, clear all cache
        await self.cache.clear()
```

## Concurrent Processing

### Async Task Orchestration

```python
# task_orchestrator.py
import asyncio
from typing import Dict, List, Any, Callable, Optional, Union
from dataclasses import dataclass
from enum import Enum
import time
import logging

logger = logging.getLogger(__name__)

class TaskPriority(Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4

class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Task:
    """Represents an executable task."""
    id: str
    name: str
    func: Callable
    args: tuple = ()
    kwargs: dict = None
    priority: TaskPriority = TaskPriority.NORMAL
    timeout: Optional[float] = None
    dependencies: List[str] = None
    retry_count: int = 0
    max_retries: int = 3

    # Runtime state
    status: TaskStatus = TaskStatus.PENDING
    created_at: float = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.kwargs is None:
            self.kwargs = {}
        if self.dependencies is None:
            self.dependencies = []
        if self.created_at is None:
            self.created_at = time.time()

class AsyncTaskOrchestrator:
    """High-performance async task orchestrator with dependency management."""

    def __init__(self,
                 max_concurrent: int = 10,
                 worker_count: int = 4,
                 queue_size: int = 1000):
        self.max_concurrent = max_concurrent
        self.worker_count = worker_count
        self.queue_size = queue_size

        # Task management
        self.tasks: Dict[str, Task] = {}
        self.task_queue = asyncio.PriorityQueue(maxsize=queue_size)
        self.running_tasks: Dict[str, asyncio.Task] = {}
        self.completed_tasks: Dict[str, Task] = {}

        # Synchronization
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.lock = asyncio.Lock()

        # Control
        self.running = False
        self.workers: List[asyncio.Task] = []

        # Metrics
        self.metrics = {
            "tasks_submitted": 0,
            "tasks_completed": 0,
            "tasks_failed": 0,
            "avg_execution_time": 0.0,
            "queue_wait_time": 0.0
        }

    async def start(self):
        """Start the task orchestrator."""
        if self.running:
            return

        self.running = True
        self.workers = []

        # Start worker tasks
        for i in range(self.worker_count):
            worker = asyncio.create_task(self._worker_loop(i))
            self.workers.append(worker)

        logger.info(f"Started task orchestrator with {self.worker_count} workers")

    async def stop(self):
        """Stop the task orchestrator."""
        if not self.running:
            return

        self.running = False

        # Cancel all running tasks
        for task in self.running_tasks.values():
            task.cancel()

        # Cancel workers
        for worker in self.workers:
            worker.cancel()

        # Wait for cleanup
        await asyncio.gather(*self.workers, return_exceptions=True)

        logger.info("Stopped task orchestrator")

    async def submit_task(self, task: Task) -> str:
        """Submit a task for execution."""
        async with self.lock:
            self.tasks[task.id] = task
            self.metrics["tasks_submitted"] += 1

            # Create priority queue item (negative priority for higher priority first)
            priority_item = (-task.priority.value, task.created_at, task.id)

            try:
                await asyncio.wait_for(
                    self.task_queue.put(priority_item),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.error(f"Task queue full, failed to submit task {task.id}")
                task.status = TaskStatus.FAILED
                task.error = "Queue full"
                return task.id

            logger.debug(f"Submitted task {task.id} with priority {task.priority}")
            return task.id

    async def _worker_loop(self, worker_id: int):
        """Worker loop for processing tasks."""
        logger.debug(f"Worker {worker_id} started")

        while self.running:
            try:
                # Get next task from queue
                priority_item = await self.task_queue.get()

                if not self.running:
                    break

                _, _, task_id = priority_item

                # Check dependencies
                if not await self._check_dependencies(task_id):
                    # Re-queue if dependencies not met
                    await asyncio.sleep(0.1)  # Small delay
                    await self.task_queue.put(priority_item)
                    continue

                # Execute task
                await self._execute_task(task_id, worker_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(1)  # Error backoff

        logger.debug(f"Worker {worker_id} stopped")

    async def _check_dependencies(self, task_id: str) -> bool:
        """Check if task dependencies are satisfied."""
        task = self.tasks.get(task_id)
        if not task or not task.dependencies:
            return True

        for dep_id in task.dependencies:
            dep_task = self.tasks.get(dep_id)
            if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                return False

        return True

    async def _execute_task(self, task_id: str, worker_id: int):
        """Execute a single task."""
        task = self.tasks.get(task_id)
        if not task:
            return

        async with self.semaphore:
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()

            # Create execution task
            exec_task = asyncio.create_task(self._run_task_function(task))
            self.running_tasks[task_id] = exec_task

            try:
                if task.timeout:
                    result = await asyncio.wait_for(exec_task, timeout=task.timeout)
                else:
                    result = await exec_task

                # Task completed successfully
                task.status = TaskStatus.COMPLETED
                task.completed_at = time.time()
                task.result = result

                self.metrics["tasks_completed"] += 1
                self._update_execution_metrics(task)

                logger.debug(f"Task {task_id} completed successfully")

            except asyncio.TimeoutError:
                task.status = TaskStatus.FAILED
                task.error = "Timeout"
                self.metrics["tasks_failed"] += 1
                logger.error(f"Task {task_id} timed out")

            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                self.metrics["tasks_failed"] += 1
                logger.error(f"Task {task_id} failed: {e}")

                # Retry logic
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.status = TaskStatus.PENDING
                    # Re-queue for retry
                    await self.submit_task(task)
                    logger.info(f"Retrying task {task_id} (attempt {task.retry_count})")

            finally:
                # Cleanup
                self.running_tasks.pop(task_id, None)

                # Move to completed tasks
                if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
                    self.completed_tasks[task_id] = task

    async def _run_task_function(self, task: Task) -> Any:
        """Run the actual task function."""
        if asyncio.iscoroutinefunction(task.func):
            return await task.func(*task.args, **task.kwargs)
        else:
            # Run in thread pool for sync functions
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, task.func, *task.args, **task.kwargs)

    def _update_execution_metrics(self, task: Task):
        """Update execution time metrics."""
        if task.started_at and task.completed_at:
            execution_time = task.completed_at - task.started_at

            # Update rolling average
            total_completed = self.metrics["tasks_completed"]
            current_avg = self.metrics["avg_execution_time"]
            self.metrics["avg_execution_time"] = (
                (current_avg * (total_completed - 1)) + execution_time
            ) / total_completed

    async def get_task_status(self, task_id: str) -> Optional[Task]:
        """Get the status of a task."""
        return self.tasks.get(task_id)

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task."""
        if task_id in self.running_tasks:
            self.running_tasks[task_id].cancel()
            task = self.tasks.get(task_id)
            if task:
                task.status = TaskStatus.CANCELLED
            return True
        return False

    def get_metrics(self) -> Dict[str, Any]:
        """Get orchestrator performance metrics."""
        return {
            "queue_size": self.task_queue.qsize(),
            "running_tasks": len(self.running_tasks),
            "completed_tasks": len(self.completed_tasks),
            "total_tasks": len(self.tasks),
            **self.metrics
        }

    async def wait_for_completion(self, task_ids: List[str], timeout: Optional[float] = None) -> Dict[str, TaskStatus]:
        """Wait for multiple tasks to complete."""
        async def check_completion():
            while True:
                all_completed = all(
                    self.tasks.get(task_id).status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]
                    for task_id in task_ids
                    if task_id in self.tasks
                )

                if all_completed:
                    break

                await asyncio.sleep(0.1)

        try:
            await asyncio.wait_for(check_completion(), timeout=timeout)
        except asyncio.TimeoutError:
            pass

        return {
            task_id: self.tasks.get(task_id).status
            for task_id in task_ids
            if task_id in self.tasks
        }
```

## Monitoring and Alerting

### Performance Monitoring Dashboard

```python
# performance_dashboard.py
import asyncio
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import psutil
import aiohttp

class PerformanceDashboard:
    """Real-time performance monitoring dashboard."""

    def __init__(self, metrics_port: int = 9090):
        self.metrics_port = metrics_port
        self.metrics_history = []
        self.alerts = []
        self.alert_handlers = []

    async def start_monitoring(self, interval_seconds: int = 10):
        """Start continuous performance monitoring."""
        while True:
            metrics = await self.collect_metrics()
            self.metrics_history.append(metrics)

            # Keep only last 24 hours of data
            cutoff_time = datetime.now() - timedelta(hours=24)
            self.metrics_history = [
                m for m in self.metrics_history
                if m["timestamp"] > cutoff_time
            ]

            # Check for alerts
            await self.check_alerts(metrics)

            await asyncio.sleep(interval_seconds)

    async def collect_metrics(self) -> Dict[str, Any]:
        """Collect comprehensive system and application metrics."""
        process = psutil.Process()

        return {
            "timestamp": datetime.now(),
            "system": {
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_usage": psutil.disk_usage('/').percent,
                "network_connections": len(psutil.net_connections())
            },
            "process": {
                "cpu_percent": process.cpu_percent(),
                "memory_mb": process.memory_info().rss / 1024 / 1024,
                "memory_percent": process.memory_percent(),
                "threads": process.num_threads(),
                "fds": process.num_fds() if hasattr(process, 'num_fds') else None
            },
            "application": await self.collect_app_metrics()
        }

    async def collect_app_metrics(self) -> Dict[str, Any]:
        """Collect application-specific metrics."""
        # This would integrate with your application metrics
        return {
            "active_connections": 0,  # WebSocket connections
            "requests_per_second": 0,
            "average_response_time": 0,
            "error_rate": 0,
            "memory_cache_hit_rate": 0,
            "llm_tokens_per_second": 0
        }

    async def check_alerts(self, metrics: Dict[str, Any]):
        """Check metrics against alert thresholds."""
        alerts = []

        # CPU alerts
        if metrics["system"]["cpu_percent"] > 90:
            alerts.append({
                "level": "critical",
                "message": f"High CPU usage: {metrics['system']['cpu_percent']:.1f}%",
                "metric": "cpu_percent",
                "value": metrics["system"]["cpu_percent"],
                "threshold": 90
            })

        # Memory alerts
        if metrics["system"]["memory_percent"] > 85:
            alerts.append({
                "level": "warning",
                "message": f"High memory usage: {metrics['system']['memory_percent']:.1f}%",
                "metric": "memory_percent",
                "value": metrics["system"]["memory_percent"],
                "threshold": 85
            })

        # Disk alerts
        if metrics["system"]["disk_usage"] > 95:
            alerts.append({
                "level": "critical",
                "message": f"Low disk space: {metrics['system']['disk_usage']:.1f}% used",
                "metric": "disk_usage",
                "value": metrics["system"]["disk_usage"],
                "threshold": 95
            })

        # Process alerts
        if metrics["process"]["cpu_percent"] > 80:
            alerts.append({
                "level": "warning",
                "message": f"High process CPU: {metrics['process']['cpu_percent']:.1f}%",
                "metric": "process_cpu_percent",
                "value": metrics["process"]["cpu_percent"],
                "threshold": 80
            })

        for alert in alerts:
            self.alerts.append({**alert, "timestamp": datetime.now()})

            # Trigger alert handlers
            for handler in self.alert_handlers:
                await handler(alert)

        # Keep only recent alerts
        cutoff_time = datetime.now() - timedelta(hours=1)
        self.alerts = [a for a in self.alerts if a["timestamp"] > cutoff_time]

    def add_alert_handler(self, handler):
        """Add an alert notification handler."""
        self.alert_handlers.append(handler)

    async def get_dashboard_data(self) -> Dict[str, Any]:
        """Get data for dashboard display."""
        if not self.metrics_history:
            return {"error": "No metrics data available"}

        latest = self.metrics_history[-1]

        # Calculate trends
        if len(self.metrics_history) > 1:
            previous = self.metrics_history[-2]
            trends = self._calculate_trends(latest, previous)
        else:
            trends = {}

        return {
            "current": latest,
            "trends": trends,
            "alerts": self.alerts[-10:],  # Last 10 alerts
            "history": self.metrics_history[-60:]  # Last hour of data
        }

    def _calculate_trends(self, current: Dict, previous: Dict) -> Dict[str, Any]:
        """Calculate metric trends."""
        trends = {}

        def trend_value(current_val, prev_val):
            if prev_val == 0:
                return 0
            return ((current_val - prev_val) / prev_val) * 100

        # System trends
        for metric in ["cpu_percent", "memory_percent", "disk_usage"]:
            if metric in current["system"] and metric in previous["system"]:
                trends[f"system_{metric}"] = trend_value(
                    current["system"][metric],
                    previous["system"][metric]
                )

        # Process trends
        for metric in ["cpu_percent", "memory_mb"]:
            if metric in current["process"] and metric in previous["process"]:
                trends[f"process_{metric}"] = trend_value(
                    current["process"][metric],
                    previous["process"][metric]
                )

        return trends

    async def export_metrics(self, format: str = "json") -> str:
        """Export metrics in various formats."""
        data = await self.get_dashboard_data()

        if format == "json":
            return json.dumps(data, default=str, indent=2)
        elif format == "prometheus":
            return self._format_prometheus(data)
        else:
            return json.dumps(data, default=str)

    def _format_prometheus(self, data: Dict[str, Any]) -> str:
        """Format metrics for Prometheus."""
        lines = []

        def add_metric(name, value, labels=""):
            lines.append(f"{name}{labels} {value}")

        current = data["current"]

        # System metrics
        add_metric("pa_system_cpu_percent", current["system"]["cpu_percent"])
        add_metric("pa_system_memory_percent", current["system"]["memory_percent"])
        add_metric("pa_system_disk_usage_percent", current["system"]["disk_usage"])
        add_metric("pa_system_network_connections", current["system"]["network_connections"])

        # Process metrics
        add_metric("pa_process_cpu_percent", current["process"]["cpu_percent"])
        add_metric("pa_process_memory_mb", current["process"]["memory_mb"])
        add_metric("pa_process_threads", current["process"]["threads"])

        return "\n".join(lines)

class AlertNotifier:
    """Handle alert notifications."""

    def __init__(self, webhook_url: Optional[str] = None, slack_token: Optional[str] = None):
        self.webhook_url = webhook_url
        self.slack_token = slack_token
        self.http_client = aiohttp.ClientSession()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.http_client.close()

    async def send_alert(self, alert: Dict[str, Any]):
        """Send alert notification."""
        message = f"🚨 **{alert['level'].upper()}**: {alert['message']}"

        if self.webhook_url:
            payload = {
                "text": message,
                "alert": alert
            }
            async with self.http_client.post(self.webhook_url, json=payload) as response:
                if response.status != 200:
                    print(f"Failed to send webhook alert: {response.status}")

        if self.slack_token:
            # Send to Slack
            slack_payload = {
                "channel": "#alerts",
                "text": message,
                "attachments": [{
                    "color": "danger" if alert["level"] == "critical" else "warning",
                    "fields": [
                        {"title": "Metric", "value": alert["metric"], "short": True},
                        {"title": "Value", "value": str(alert["value"]), "short": True},
                        {"title": "Threshold", "value": str(alert["threshold"]), "short": True}
                    ]
                }]
            }

            headers = {"Authorization": f"Bearer {self.slack_token}"}
            async with self.http_client.post("https://slack.com/api/chat.postMessage",
                                          json=slack_payload, headers=headers) as response:
                if response.status != 200:
                    print(f"Failed to send Slack alert: {response.status}")
```

## Performance Troubleshooting

### Automated Diagnostics

```python
# performance_diagnostics.py
import asyncio
import time
from typing import Dict, List, Any, Optional
import psutil
import aiohttp

class PerformanceDiagnostician:
    """Automated performance diagnostics and troubleshooting."""

    def __init__(self):
        self.process = psutil.Process()
        self.diagnostics = []
        self.baseline_metrics = {}

    async def run_full_diagnostics(self) -> Dict[str, Any]:
        """Run comprehensive performance diagnostics."""
        print("🔍 Running Performance Diagnostics...")

        diagnostics = {
            "timestamp": time.time(),
            "system_check": await self._check_system_resources(),
            "application_check": await self._check_application_performance(),
            "bottleneck_analysis": await self._analyze_bottlenecks(),
            "recommendations": await self._generate_recommendations()
        }

        self.diagnostics.append(diagnostics)
        return diagnostics

    async def _check_system_resources(self) -> Dict[str, Any]:
        """Check system resource utilization."""
        issues = []

        # CPU check
        cpu_percent = psutil.cpu_percent(interval=1)
        if cpu_percent > 80:
            issues.append({
                "type": "high_cpu",
                "severity": "high",
                "message": f"CPU usage is high: {cpu_percent:.1f}%",
                "current": cpu_percent,
                "recommended": "< 70%"
            })

        # Memory check
        memory = psutil.virtual_memory()
        if memory.percent > 85:
            issues.append({
                "type": "high_memory",
                "severity": "high",
                "message": f"Memory usage is high: {memory.percent:.1f}%",
                "current": memory.percent,
                "recommended": "< 80%"
            })

        # Disk check
        disk = psutil.disk_usage('/')
        if disk.percent > 90:
            issues.append({
                "type": "low_disk_space",
                "severity": "critical",
                "message": f"Disk space is low: {disk.percent:.1f}% used",
                "current": disk.percent,
                "recommended": "< 85%"
            })

        # Network check
        network = psutil.net_io_counters()
        if hasattr(network, 'packets_sent'):
            # Basic network health check
            pass

        return {
            "status": "healthy" if not issues else "issues_found",
            "issues": issues,
            "metrics": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "disk_percent": disk.percent,
                "network_connections": len(psutil.net_connections())
            }
        }

    async def _check_application_performance(self) -> Dict[str, Any]:
        """Check application-specific performance metrics."""
        issues = []

        # This would integrate with your application metrics
        # For demonstration, we'll check basic process metrics

        process_cpu = self.process.cpu_percent()
        process_memory = self.process.memory_percent()

        if process_cpu > 50:
            issues.append({
                "type": "high_process_cpu",
                "severity": "medium",
                "message": f"Process CPU usage is high: {process_cpu:.1f}%",
                "current": process_cpu,
                "recommended": "< 40%"
            })

        if process_memory > 60:
            issues.append({
                "type": "high_process_memory",
                "severity": "medium",
                "message": f"Process memory usage is high: {process_memory:.1f}%",
                "current": process_memory,
                "recommended": "< 50%"
            })

        return {
            "status": "healthy" if not issues else "issues_found",
            "issues": issues,
            "process_metrics": {
                "cpu_percent": process_cpu,
                "memory_percent": process_memory,
                "threads": self.process.num_threads(),
                "fds": self.process.num_fds() if hasattr(self.process, 'num_fds') else None
            }
        }

    async def _analyze_bottlenecks(self) -> Dict[str, Any]:
        """Analyze system bottlenecks."""
        bottlenecks = []

        # CPU bottleneck analysis
        cpu_times = psutil.cpu_times_percent(interval=1)
        if cpu_times.user > 70:
            bottlenecks.append({
                "component": "cpu",
                "type": "computation_bound",
                "message": "System is CPU-bound",
                "evidence": f"User CPU time: {cpu_times.user:.1f}%"
            })

        # Memory bottleneck analysis
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()

        if swap.percent > 10:
            bottlenecks.append({
                "component": "memory",
                "type": "swapping",
                "message": "System is using swap memory",
                "evidence": f"Swap usage: {swap.percent:.1f}%"
            })

        # I/O bottleneck analysis
        disk_io = psutil.disk_io_counters()
        if disk_io:
            # Calculate I/O wait time
            io_counters = psutil.cpu_times_percent(interval=1)
            if hasattr(io_counters, 'iowait') and io_counters.iowait > 5:
                bottlenecks.append({
                    "component": "disk_io",
                    "type": "io_bound",
                    "message": "System is I/O bound",
                    "evidence": f"I/O wait time: {io_counters.iowait:.1f}%"
                })

        return {
            "bottlenecks_found": len(bottlenecks),
            "bottlenecks": bottlenecks
        }

    async def _generate_recommendations(self) -> List[str]:
        """Generate performance improvement recommendations."""
        recommendations = []

        # Run diagnostics first
        system_check = await self._check_system_resources()
        app_check = await self._check_application_performance()
        bottlenecks = await self._analyze_bottlenecks()

        # Generate recommendations based on findings
        all_issues = system_check.get("issues", []) + app_check.get("issues", [])

        if any(issue["type"] == "high_cpu" for issue in all_issues):
            recommendations.extend([
                "Consider optimizing CPU-intensive operations",
                "Implement request queuing to smooth CPU load",
                "Consider horizontal scaling if CPU is consistently high"
            ])

        if any(issue["type"] in ["high_memory", "high_process_memory"] for issue in all_issues):
            recommendations.extend([
                "Implement memory pooling for frequently used objects",
                "Check for memory leaks using profiling tools",
                "Consider increasing available RAM or optimizing memory usage"
            ])

        if bottlenecks["bottlenecks_found"] > 0:
            bottleneck_types = [b["type"] for b in bottlenecks["bottlenecks"]]
            if "io_bound" in bottleneck_types:
                recommendations.extend([
                    "Consider using faster storage (SSD vs HDD)",
                    "Implement I/O caching strategies",
                    "Optimize database queries and indexes"
                ])

        # General recommendations
        recommendations.extend([
            "Implement comprehensive monitoring and alerting",
            "Set up automated performance regression testing",
            "Consider implementing circuit breakers for external services",
            "Optimize LLM prompt sizes and caching strategies"
        ])

        return list(set(recommendations))  # Remove duplicates

    async def create_baseline(self) -> Dict[str, Any]:
        """Create performance baseline for comparison."""
        print("📊 Creating Performance Baseline...")

        # Run multiple measurements
        measurements = []
        for i in range(5):
            metrics = await self._measure_current_performance()
            measurements.append(metrics)
            await asyncio.sleep(2)

        # Calculate averages
        baseline = {}
        for key in measurements[0].keys():
            if key != "timestamp":
                values = [m[key] for m in measurements if key in m]
                if values:
                    baseline[key] = {
                        "average": sum(values) / len(values),
                        "min": min(values),
                        "max": max(values),
                        "std_dev": statistics.stdev(values) if len(values) > 1 else 0
                    }

        self.baseline_metrics = baseline
        return baseline

    async def _measure_current_performance(self) -> Dict[str, Any]:
        """Measure current system performance."""
        return {
            "timestamp": time.time(),
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_io_read": psutil.disk_io_counters().read_bytes if psutil.disk_io_counters() else 0,
            "disk_io_write": psutil.disk_io_counters().write_bytes if psutil.disk_io_counters() else 0,
            "network_bytes_sent": psutil.net_io_counters().bytes_sent,
            "network_bytes_recv": psutil.net_io_counters().bytes_recv,
            "process_cpu": self.process.cpu_percent(),
            "process_memory": self.process.memory_percent()
        }

    async def compare_to_baseline(self) -> Dict[str, Any]:
        """Compare current performance to baseline."""
        if not self.baseline_metrics:
            return {"error": "No baseline available. Run create_baseline() first."}

        current = await self._measure_current_performance()
        comparison = {}

        for metric, baseline_data in self.baseline_metrics.items():
            if metric in current:
                current_value = current[metric]
                baseline_avg = baseline_data["average"]
                deviation = ((current_value - baseline_avg) / baseline_avg) * 100

                comparison[metric] = {
                    "current": current_value,
                    "baseline_average": baseline_avg,
                    "deviation_percent": deviation,
                    "status": "normal" if abs(deviation) < 20 else "warning" if abs(deviation) < 50 else "critical"
                }

        return {
            "timestamp": current["timestamp"],
            "comparison": comparison,
            "overall_status": "healthy" if all(c["status"] == "normal" for c in comparison.values()) else "degraded"
        }

    def get_diagnostic_report(self) -> str:
        """Generate a comprehensive diagnostic report."""
        if not self.diagnostics:
            return "No diagnostics available. Run run_full_diagnostics() first."

        latest = self.diagnostics[-1]

        report = []
        report.append("# Performance Diagnostic Report")
        report.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")

        # System status
        system = latest["system_check"]
        report.append("## System Resource Status")
        report.append(f"Status: {system['status'].replace('_', ' ').title()}")

        if system["issues"]:
            report.append("Issues Found:")
            for issue in system["issues"]:
                report.append(f"- **{issue['severity'].upper()}**: {issue['message']}")
                report.append(f"  Current: {issue['current']}, Recommended: {issue['recommended']}")
        else:
            report.append("✅ No system resource issues detected")
        report.append("")

        # Application status
        app = latest["application_check"]
        report.append("## Application Performance Status")
        report.append(f"Status: {app['status'].replace('_', ' ').title()}")

        if app["issues"]:
            report.append("Issues Found:")
            for issue in app["issues"]:
                report.append(f"- **{issue['severity'].upper()}**: {issue['message']}")
        else:
            report.append("✅ No application performance issues detected")
        report.append("")

        # Bottlenecks
        bottlenecks = latest["bottleneck_analysis"]
        report.append("## Bottleneck Analysis")
        if bottlenecks["bottlenecks_found"] > 0:
            report.append(f"Found {bottlenecks['bottlenecks_found']} potential bottleneck(s):")
            for bottleneck in bottlenecks["bottlenecks"]:
                report.append(f"- **{bottleneck['component'].upper()}**: {bottleneck['message']}")
                report.append(f"  Evidence: {bottleneck['evidence']}")
        else:
            report.append("✅ No significant bottlenecks detected")
        report.append("")

        # Recommendations
        recommendations = latest["recommendations"]
        report.append("## Performance Recommendations")
        for rec in recommendations:
            report.append(f"- {rec}")

        return "\n".join(report)
```

This performance tuning guide provides comprehensive strategies for optimizing the Personal Assistant system, including benchmarking tools, memory management, caching strategies, and automated diagnostics. The examples can be directly applied to improve system performance and reliability.
