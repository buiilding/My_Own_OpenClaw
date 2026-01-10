# Stateless Services Migration Plan

## Executive Summary

This document outlines a comprehensive plan to migrate from singleton, in-process services (OCR, TTS, Vision, Embeddings) to stateless, horizontally-scalable worker services using Redis message queues and value storage. This migration will enable:

- **Horizontal Scaling**: Add worker instances as needed (true multi-node scaling)
- **Resource Isolation**: Each service has dedicated GPU/CPU resources
- **Fault Tolerance**: Worker failures don't crash the backend
- **Independent Deployment**: Update services without backend restarts
- **Multi-User Support**: Handle concurrent requests across multiple users
- **Cloud-Native Ready**: Works in Kubernetes, Docker Swarm, any distributed setup
- **Efficient Data Transfer**: Redis value storage eliminates base64 serialization overhead
- **Tiny Redis Messages**: Only key references (~100 bytes) instead of base64 images (~2MB)
- **Direct Reply Queues**: Zero CPU waste, linear scalability (no Pub/Sub broadcast storm)
- **Dynamic Batching**: 5-10x throughput improvement for batch-capable operations
- **Optimized Persistence**: Redis persistence disabled for ephemeral request queues

---

## Key Optimizations: Redis Value Storage & Direct Reply Queues

### Optimization 1: Redis Value Storage for Images (Not Shared Memory)

**Problem**: Base64-encoding images for Redis messages creates massive overhead:
- 1920x1080 PNG screenshot: ~2MB base64 string
- Redis message size: ~2MB per request
- Serialization/deserialization overhead
- Network bandwidth waste

**Original Solution (Shared Memory)**: Use `/dev/shm` for zero-copy transfer
- **Fatal Flaw**: Tightly couples backend and workers to same physical node
- **Cannot scale across machines**: Machine B workers cannot read Machine A's `/dev/shm`
- **Complexity**: Requires volume mounts, file cleanup tasks, race conditions

**Optimized Solution**: Store binary data directly in Redis with TTL
- Backend stores image bytes in Redis: `SETEX image:{request_id} 60 <binary_data>`
- Redis message contains only key reference: `{"image_key": "image:uuid"}`
- Workers fetch directly from Redis: `GET image:{request_id}`
- Automatic cleanup via Redis TTL (no manual file management)

**Benefits**:
- **99.99% reduction in Redis message size** (100 bytes vs 2MB)
- **True multi-node scaling**: Backend and workers can be on different machines
- **Simpler architecture**: No volume mounts, no file cleanup tasks
- **Automatic cleanup**: Redis TTL handles expiration
- **Cloud-native ready**: Works in Kubernetes, Docker Swarm, any distributed setup

### Optimization 2: Direct Reply Queues (Not Pub/Sub Broadcast)

**Problem**: Pub/Sub broadcasts every response to ALL backend instances
- If you have 50 backend replicas, 49 wake up for every response
- Wastes CPU deserializing JSON that gets discarded
- Network flood of unnecessary messages

**Optimized Solution**: Direct reply queues per backend instance
- Each backend creates unique reply queue: `responses:backend-{instance_id}`
- Request includes `reply_to` field: `{"reply_to": "responses:backend-abc", ...}`
- Worker pushes result directly to that queue: `RPUSH responses:backend-abc <result>`
- Backend blocks on its own queue: `BLPOP responses:backend-abc`
- Zero wasted CPU, linear scalability

**Benefits**:
- **Zero CPU waste**: Only the requesting backend receives the response
- **Linear scalability**: Performance doesn't degrade with more backend instances
- **Lower latency**: No broadcast overhead
- **Simpler code**: No need to filter responses by request_id

### Optimization 3: Dynamic Batching for Throughput

**Problem**: Processing requests one-by-one wastes GPU resources
- GPU operations are 5-10x faster in batches
- Sequential processing underutilizes expensive hardware

**Optimized Solution**: Workers batch multiple requests when available
- Worker tries to grab multiple items: `LPOP ocr:requests 5`
- Process as batch if model supports it (OCR, Embeddings)
- Fallback to single-item processing if queue is empty
- Reduces per-request overhead significantly

**Benefits**:
- **5-10x throughput improvement** for batch-capable operations
- **Better GPU utilization**: Keeps expensive hardware busy
- **Lower latency per item**: Batch processing amortizes overhead

**Redis Persistence Strategy**:
- **Request queues**: Persistence DISABLED (stale requests don't need to be processed after restart)
- **Image/data storage**: TTL-based expiration (60 seconds default)
- **Semantic memory cache**: Persistence ENABLED (if using Redis for caching)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Implementation Phases](#implementation-phases)
4. [Service Specifications](#service-specifications)
5. [Backend Integration](#backend-integration)
6. [Migration Strategy](#migration-strategy)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Monitoring & Observability](#monitoring--observability)
10. [Rollback Plan](#rollback-plan)

---

## Architecture Overview

### Current Architecture (Before Migration)

```
┌─────────────────────────────────────────────────┐
│           Backend API Server                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ OCR      │  │ TTS      │  │ Vision   │     │
│  │ Singleton│  │ Singleton│  │ Singleton│     │
│  └──────────┘  └──────────┘  └──────────┘     │
│  ┌──────────┐                                 │
│  │Embedding │                                 │
│  │Singleton │                                 │
│  └──────────┘                                 │
└─────────────────────────────────────────────────┘
```

**Problems:**
- Single instance per service (bottleneck)
- All users compete for same resources
- GPU memory contention
- No horizontal scaling
- Service failures affect entire backend

### Target Architecture (After Migration)

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend API Server                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Service      │  │ Service      │  │ Service      │   │
│  │ Client       │  │ Client       │  │ Client       │   │
│  │ (OCR)        │  │ (TTS)        │  │ (Vision)     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│  ┌──────┴───────┐                        │              │
│  │ Service      │                        │              │
│  │ Client       │                        │              │
│  │ (Embedding)  │                        │              │
│  └──────┬───────┘                        │              │
└─────────┼─────────────────────────────────┼──────────────┘
          │  Request/Response via Redis      │
          ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Message Queue                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ ocr:requests │  │ tts:requests │  │ vision:reqs  │   │
│  │ ocr:results  │  │ tts:results  │  │ vision:resps │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐                                        │
│  │embed:requests│                                        │
│  │embed:results │                                        │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  OCR Worker 1    │ │  TTS Worker 1    │ │ Vision Worker 1  │
│  OCR Worker 2    │ │  TTS Worker 2    │ │ Vision Worker 2  │
│  OCR Worker 3    │ │  ...              │ │ Vision Worker 3  │
│  (Stateless)     │ │  (Stateless)     │ │  (Stateless)     │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐
│ Embedding Worker │
│  Worker 1        │
│  Worker 2        │
│  (Stateless)     │
└──────────────────┘
```

**Benefits:**
- Horizontal scaling (add workers as needed)
- Resource isolation per worker
- Fault tolerance (worker failures don't crash backend)
- Independent deployment and updates
- Load distribution across workers

---

## Infrastructure Requirements

### 1. Redis Server

**Purpose**: Message queue for request/response communication

**Requirements:**
- Redis 7.0+ (for pub/sub and list operations)
- **Persistence DISABLED for request queues** (ephemeral data, no need to persist stale requests)
- **Persistence ENABLED only for semantic.db / Embeddings cache** (if using Redis for caching)
- High availability (Redis Sentinel or Cluster for production)

**Configuration:**
```yaml
redis:
  url: "redis://localhost:6379"
  max_connections: 100
  socket_timeout: 30
  socket_connect_timeout: 5
  retry_on_timeout: true
  health_check_interval: 10
  # Disable persistence for request queues (RDB/AOF)
  save: ""  # Disable RDB snapshots
  appendonly: "no"  # Disable AOF persistence
```

**Why Disable Persistence for Request Queues:**
- Request queues are ephemeral - if power goes out, you don't need to process 5-minute-old OCR requests
- They are stale and will be re-requested by the backend if needed
- Reduces disk I/O overhead
- Only enable persistence for long-term data (semantic memory cache, embeddings cache)

### 2. Service Workers

**Resource Requirements per Worker:**

| Service | CPU | GPU | RAM | Model Size |
|---------|-----|-----|-----|------------|
| OCR Worker | 2 cores | 1GB VRAM | 2GB | ~500MB |
| TTS Worker | 2 cores | 1GB VRAM | 2GB | ~100MB |
| Vision Worker | 4 cores | 2GB VRAM | 4GB | ~8GB |
| Embedding Worker | 2 cores | 1GB VRAM | 2GB | ~400MB |

**Scaling Recommendations:**
- **OCR**: 3-5 workers (high frequency, fast operations)
- **TTS**: 2-3 workers (moderate frequency, streaming)
- **Vision**: 2-3 workers (lower frequency, heavy GPU usage)
- **Embedding**: 2-4 workers (moderate frequency, caching reduces load)

### 3. Network Requirements

- Backend ↔ Redis: Low latency (<5ms)
- Workers ↔ Redis: Low latency (<5ms)
- Backend ↔ Workers: No direct connection (via Redis only)

### 4. Redis Value Storage for Images/Data

**Purpose**: Efficient binary data transfer via Redis (enables multi-node scaling)

**Requirements:**
- Redis 7.0+ with sufficient memory for temporary image storage
- Backend stores binary data in Redis with TTL: `SETEX image:{request_id} 60 <bytes>`
- Workers fetch from Redis: `GET image:{request_id}`
- Automatic expiration via Redis TTL (no manual cleanup needed)

**Configuration:**
```yaml
redis:
  url: "redis://localhost:6379"
  max_memory: "2gb"  # Adjust based on expected concurrent requests
  max_memory_policy: "allkeys-lru"  # Evict least recently used if memory full
  image_ttl: 60  # TTL for image/data storage (seconds)
```

**Benefits:**
- **True multi-node scaling**: Backend and workers can be on different machines
- **Tiny Redis messages**: Only key references (~100 bytes vs ~2MB for base64)
- **Automatic cleanup**: Redis TTL handles expiration (no file management)
- **Cloud-native ready**: Works in any distributed setup (K8s, Docker Swarm, etc.)
- **Simpler architecture**: No volume mounts, no cleanup tasks

---

## Implementation Phases

### Phase 1: Foundation & Infrastructure (Week 1)

**Goal**: Set up core infrastructure and service client framework

#### 1.1 Redis Setup
- [ ] Install and configure Redis
- [ ] Set up Redis monitoring
- [ ] Create Redis connection pool in backend
- [ ] Add Redis health checks

#### 1.2 Service Client Framework
- [ ] Create `ServiceClient` base class
- [ ] Implement request/response protocol
- [ ] Add timeout and retry logic
- [ ] Implement connection pooling
- [ ] Add request ID tracking
- [ ] Create service client interfaces

#### 1.3 Project Structure
- [ ] Create `services/` directory at project root
- [ ] Set up worker project templates
- [ ] Create shared utilities module
- [ ] Set up Docker configurations with shared memory volume mounts

#### 1.4 Redis Value Storage Setup
- [ ] Configure Redis memory limits and eviction policies
- [ ] Implement Redis value storage utilities (SETEX/GET for images)
- [ ] Add TTL-based automatic expiration
- [ ] Test multi-node deployment (backend and workers on different machines)

**Deliverables:**
- Redis running and accessible (persistence disabled for request queues)
- `ServiceClient` class implemented with Redis value storage and direct reply queues
- Basic worker template created with batching support
- Docker Compose setup for local development (no volume mounts needed)

---

### Phase 2: OCR Worker Implementation (Week 2)

**Goal**: Migrate OCR from singleton plugin to stateless worker

#### 2.1 OCR Worker Development

**File Structure:**
```
services/ocr_worker/
├── __init__.py
├── main.py                 # Worker entry point
├── ocr_engine.py          # OCR processing logic
├── worker.py              # Worker loop and Redis communication
├── config.py              # Configuration management
├── requirements.txt
├── Dockerfile
└── README.md
```

**Implementation Details:**

**`main.py`** - Entry point:
```python
"""
OCR Worker Entry Point

Stateless OCR service worker that processes screenshot OCR requests
via Redis message queue.
"""
import asyncio
import logging
import os
from ocr_worker.worker import OCRWorker

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Main entry point for OCR worker."""
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    worker_id = os.getenv("WORKER_ID", f"ocr-{os.getpid()}")
    
    worker = OCRWorker(redis_url=redis_url, worker_id=worker_id)
    
    try:
        await worker.initialize()
        logger.info(f"OCR Worker {worker_id} started and ready")
        await worker.run()
    except KeyboardInterrupt:
        logger.info(f"OCR Worker {worker_id} shutting down...")
    except Exception as e:
        logger.error(f"OCR Worker {worker_id} crashed: {e}", exc_info=True)
    finally:
        await worker.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
```

**`ocr_engine.py`** - OCR processing:
```python
"""
OCR Engine

Handles OCR processing using RapidOCR with CUDA/CPU support.
Fetches images from Redis (enables multi-node scaling).
"""
import logging
from typing import List, Dict, Any, Optional
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class OCREngine:
    """OCR engine for processing screenshots."""
    
    def __init__(self, use_cuda: bool = True):
        self.use_cuda = use_cuda
        self._ocr_engine = None
        self._initialize_engine()
    
    def _initialize_engine(self):
        """Initialize RapidOCR engine."""
        try:
            from rapidocr import RapidOCR
            
            ocr_params = {
                "EngineConfig.onnxruntime.use_cuda": self.use_cuda,
            }
            self._ocr_engine = RapidOCR(params=ocr_params)
            logger.info(f"OCR engine initialized (CUDA: {self.use_cuda})")
        except Exception as e:
            logger.error(f"Failed to initialize OCR engine: {e}")
            raise
    
    async def process_screenshot(
        self,
        redis_client: redis.Redis,
        image_key: str
    ) -> List[Dict[str, Any]]:
        """
        Process screenshot from Redis and return OCR results.
        
        Args:
            redis_client: Redis client instance
            image_key: Redis key for image data (e.g., "image:request_123")
            
        Returns:
            List of OCR results with text, bounding boxes, and confidence
        """
        try:
            # Fetch image from Redis
            image_bytes = await redis_client.get(image_key)
            if image_bytes is None:
                raise ValueError(f"Image not found in Redis: {image_key}")
            
            # Perform OCR
            result = self._ocr_engine(image_bytes)
            
            # Format results
            ocr_results = []
            text_list = getattr(result, "txts", [])
            boxes_list = getattr(result, "boxes", [])
            scores_list = getattr(result, "scores", [])
            
            for i, (text, box, score) in enumerate(zip(text_list, boxes_list, scores_list)):
                if box is None or len(box) < 4:
                    continue
                
                # Convert box to (x1, y1, x2, y2) format
                x_coords = [p[0] for p in box]
                y_coords = [p[1] for p in box]
                x1, y1 = int(min(x_coords)), int(min(y_coords))
                x2, y2 = int(max(x_coords)), int(max(y_coords))
                
                ocr_results.append({
                    "id": str(i),
                    "text": str(text).strip(),
                    "confidence": float(score) if score else 0.9,
                    "bbox": {
                        "x": x1,
                        "y": y1,
                        "width": x2 - x1,
                        "height": y2 - y1,
                    }
                })
            
            return ocr_results
            
        except Exception as e:
            logger.error(f"OCR processing failed: {e}", exc_info=True)
            raise
```

**`worker.py`** - Worker loop:
```python
"""
OCR Worker

Main worker loop that processes OCR requests from Redis queue.
"""
import asyncio
import json
import logging
import uuid
from typing import Dict, Any
import redis.asyncio as redis

from ocr_worker.ocr_engine import OCREngine

logger = logging.getLogger(__name__)


class OCRWorker:
    """Stateless OCR service worker."""
    
    def __init__(self, redis_url: str, worker_id: str = None):
        self.redis_url = redis_url
        self.worker_id = worker_id or f"ocr-{uuid.uuid4().hex[:8]}"
        self._redis: Optional[redis.Redis] = None
        self._ocr_engine: Optional[OCREngine] = None
        self.running = False
    
    async def initialize(self):
        """Initialize worker and OCR engine."""
        # Connect to Redis
        self._redis = await redis.from_url(
            self.redis_url,
            decode_responses=False  # We'll decode JSON manually
        )
        
        # Initialize OCR engine
        try:
            use_cuda = os.getenv("USE_CUDA", "true").lower() == "true"
            self._ocr_engine = OCREngine(use_cuda=use_cuda)
        except Exception as e:
            logger.error(f"Failed to initialize OCR engine: {e}")
            raise
        
        self.running = True
        logger.info(f"OCR Worker {self.worker_id} initialized")
    
    async def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process OCR request."""
        try:
            # Get image key from payload (stored in Redis by backend)
            image_key = request_data["payload"].get("image_key")
            if not image_key:
                return {
                    "success": False,
                    "error": "image_key not found in request payload"
                }
            
            # Process OCR (fetches from Redis)
            results = await self._ocr_engine.process_screenshot(
                self._redis,
                image_key
            )
            
            # Note: Redis TTL handles cleanup automatically, no manual deletion needed
            
            return {
                "success": True,
                "data": {
                    "results": results,
                    "count": len(results)
                }
            }
        except Exception as e:
            logger.error(f"OCR processing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def run(self):
        """Main worker loop with batching support."""
        while self.running:
            try:
                # Try to grab multiple items for batch processing (optimization)
                # Fallback to single item if queue is empty
                batch_size = 5  # Process up to 5 images in batch
                requests = []
                
                # Grab multiple items if available
                for _ in range(batch_size):
                    result = await self._redis.brpop("ocr:requests", timeout=0.1)
                    if result is None:
                        break
                    _, message_data = result
                    request = json.loads(message_data.decode('utf-8'))
                    requests.append(request)
                
                if not requests:
                    # No requests, send heartbeat and wait
                    await self._send_heartbeat()
                    await asyncio.sleep(1)
                    continue
                
                # Process batch (or single item)
                if len(requests) == 1:
                    # Single item processing
                    request = requests[0]
                    logger.debug(
                        f"Worker {self.worker_id} processing request {request['request_id']}"
                    )
                    
                    response_data = await self.process_request(request)
                    response_data["request_id"] = request["request_id"]
                    
                    # Push response to direct reply queue
                    reply_to = request.get("reply_to")
                    if reply_to:
                        await self._redis.rpush(reply_to, json.dumps(response_data))
                    else:
                        logger.warning(f"No reply_to in request {request['request_id']}")
                    
                    logger.debug(
                        f"Worker {self.worker_id} completed request {request['request_id']}"
                    )
                else:
                    # Batch processing (if OCR engine supports it)
                    # For now, process sequentially in batch
                    for request in requests:
                        logger.debug(
                            f"Worker {self.worker_id} processing batch request {request['request_id']}"
                        )
                        
                        response_data = await self.process_request(request)
                        response_data["request_id"] = request["request_id"]
                        
                        # Push response to direct reply queue
                        reply_to = request.get("reply_to")
                        if reply_to:
                            await self._redis.rpush(reply_to, json.dumps(response_data))
                        
                        logger.debug(
                            f"Worker {self.worker_id} completed batch request {request['request_id']}"
                        )
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {self.worker_id} error: {e}", exc_info=True)
                await asyncio.sleep(1)
    
    async def _send_heartbeat(self):
        """Send heartbeat to indicate worker is alive."""
        try:
            await self._redis.setex(
                f"worker:heartbeat:ocr:{self.worker_id}",
                10,  # 10 second TTL
                json.dumps({
                    "status": "alive",
                    "service": "ocr",
                    "worker_id": self.worker_id,
                    "timestamp": asyncio.get_event_loop().time()
                })
            )
        except Exception as e:
            logger.debug(f"Heartbeat failed: {e}")
    
    async def shutdown(self):
        """Shutdown worker gracefully."""
        self.running = False
        if self._redis:
            await self._redis.close()
        logger.info(f"OCR Worker {self.worker_id} shut down")
```

#### 2.2 Backend Service Client

**File**: `backend/src/core/services/service_client.py`

```python
"""
Service Client

Base client for communicating with stateless services via Redis.
Uses Redis value storage for image/data transfer (enables multi-node scaling).
Uses direct reply queues instead of Pub/Sub broadcast for efficiency.
"""
import asyncio
import json
import uuid
import logging
import os
from typing import Any, Dict, Optional, Union
from dataclasses import dataclass
import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Redis key prefix for image/data storage
IMAGE_KEY_PREFIX = "image:"
DATA_TTL = int(os.getenv("REDIS_DATA_TTL", "60"))  # 60 second TTL


@dataclass
class ServiceRequest:
    """Request to a stateless service."""
    request_id: str
    service_type: str
    payload: Dict[str, Any]
    timeout: float = 30.0


@dataclass
class ServiceResponse:
    """Response from a stateless service."""
    request_id: str
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ServiceClient:
    """
    Client for communicating with stateless services via Redis.
    
    Uses Redis value storage for image/data transfer:
    - Backend stores binary data in Redis: SETEX image:{request_id} 60 <bytes>
    - Sends key reference in Redis message (tiny payload)
    - Workers fetch from Redis: GET image:{request_id}
    - Automatic expiration via Redis TTL (no manual cleanup)
    
    Uses direct reply queues instead of Pub/Sub:
    - Each backend instance has unique reply queue: responses:backend-{instance_id}
    - Worker pushes result directly to that queue
    - Zero CPU waste, linear scalability
    
    Handles request/response pattern with timeout and error handling.
    """
    
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        instance_id: Optional[str] = None
    ):
        self.redis_url = redis_url
        self.instance_id = instance_id or f"backend-{uuid.uuid4().hex[:8]}"
        self._redis: Optional[redis.Redis] = None
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._reply_queue = f"responses:{self.instance_id}"
        self._reply_listener_task: Optional[asyncio.Task] = None
    
    async def initialize(self):
        """Initialize Redis connection and start reply queue listener."""
        self._redis = await redis.from_url(
            self.redis_url,
            decode_responses=False
        )
        
        # Start reply queue listener (direct queue, not Pub/Sub)
        self._reply_listener_task = asyncio.create_task(
            self._listen_for_replies()
        )
        
        logger.info(f"ServiceClient initialized (instance_id={self.instance_id}, reply_queue={self._reply_queue})")
    
    async def _listen_for_replies(self):
        """Listen for responses on direct reply queue (BLPOP)."""
        while True:
            try:
                # Blocking pop from our dedicated reply queue
                result = await self._redis.blpop(self._reply_queue, timeout=1)
                
                if result is None:
                    # Timeout, continue loop
                    continue
                
                _, message_data = result
                try:
                    response_data = json.loads(message_data.decode('utf-8'))
                    response = ServiceResponse(**response_data)
                    
                    # Resolve pending future
                    if response.request_id in self._pending_requests:
                        future = self._pending_requests.pop(response.request_id)
                        if not future.done():
                            future.set_result(response)
                    else:
                        logger.warning(f"Received response for unknown request: {response.request_id}")
                except Exception as e:
                    logger.error(f"Error processing reply: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in reply listener: {e}")
                await asyncio.sleep(1)
    
    async def _store_in_redis(
        self,
        request_id: str,
        data: bytes,
        ttl: int = DATA_TTL
    ) -> str:
        """
        Store binary data in Redis and return key.
        
        Args:
            request_id: Unique request identifier
            data: Binary data to store
            ttl: Time-to-live in seconds (default: 60)
            
        Returns:
            Redis key for the stored data
        """
        key = f"{IMAGE_KEY_PREFIX}{request_id}"
        await self._redis.setex(key, ttl, data)
        logger.debug(f"Stored {len(data)} bytes in Redis key: {key} (TTL: {ttl}s)")
        return key
    
    async def call_service(
        self,
        service_type: str,
        payload: Dict[str, Any],
        timeout: float = 30.0,
        image_data: Optional[bytes] = None,
        image_extension: str = "png"
    ) -> ServiceResponse:
        """
        Call a stateless service and wait for response.
        
        Args:
            service_type: Type of service ("ocr", "tts", "vision", "embedding")
            payload: Request payload (will be modified if image_data provided)
            timeout: Timeout in seconds
            image_data: Optional binary image data (will be written to shared memory)
            image_extension: File extension for image data (default: "png")
            
        Returns:
            ServiceResponse with result or error
        """
        request_id = str(uuid.uuid4())
        
        # If image data provided, store in Redis and replace in payload
        if image_data is not None:
            image_key = await self._store_in_redis(request_id, image_data)
            # Replace base64/image data with Redis key reference
            payload = payload.copy()
            if "screenshot" in payload:
                payload["image_key"] = image_key
                del payload["screenshot"]
            elif "image_data" in payload:
                payload["image_key"] = image_key
                del payload["image_data"]
        
        request = ServiceRequest(
            request_id=request_id,
            service_type=service_type,
            payload=payload,
            timeout=timeout
        )
        
        # Create future for response
        future = asyncio.Future()
        self._pending_requests[request_id] = future
        
        try:
            # Publish request to service queue with reply_to field
            request_queue = f"{service_type}:requests"
            request_message = json.dumps({
                "request_id": request_id,
                "reply_to": self._reply_queue,  # Direct reply queue
                "payload": payload
            })
            
            await self._redis.lpush(
                request_queue,
                request_message
            )
            
            logger.debug(
                f"Sent {service_type} request {request_id} to queue {request_queue}"
            )
            
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=timeout)
            
            # Note: Redis TTL handles cleanup automatically, no manual cleanup needed
            return response
            
        except asyncio.TimeoutError:
            self._pending_requests.pop(request_id, None)
            
            logger.warning(
                f"Service {service_type} timeout after {timeout}s for request {request_id}"
            )
            return ServiceResponse(
                request_id=request_id,
                success=False,
                error=f"Service {service_type} timeout after {timeout}s"
            )
        except Exception as e:
            self._pending_requests.pop(request_id, None)
            logger.error(f"Service call failed: {e}", exc_info=True)
            return ServiceResponse(
                request_id=request_id,
                success=False,
                error=f"Service call failed: {str(e)}"
            )
    
    async def shutdown(self):
        """Close Redis connection and cleanup."""
        if self._reply_listener_task:
            self._reply_listener_task.cancel()
            try:
                await self._reply_listener_task
            except asyncio.CancelledError:
                pass
        
        if self._redis:
            await self._redis.close()
        
        logger.info("ServiceClient shut down")
```

#### 2.3 Backend OCR Service Wrapper

**File**: `backend/src/core/services/stateless_ocr_service.py`

```python
"""
Stateless OCR Service

Wrapper around ServiceClient for OCR operations.
Uses Redis value storage for image transfer (enables multi-node scaling).
"""
import base64
import logging
from typing import Optional, List, Dict, Any, Union

from backend.src.core.services.service_client import ServiceClient

logger = logging.getLogger(__name__)


class StatelessOCRService:
    """OCR service using stateless workers."""
    
    def __init__(self, service_client: ServiceClient):
        self.client = service_client
    
    async def perform_ocr(
        self,
        screenshot: Union[str, bytes]
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR using stateless service.
        
        Args:
            screenshot: Base64-encoded screenshot string OR binary image data
            
        Returns:
            List of OCR results or None on error
        """
        # Convert base64 to bytes if needed
        if isinstance(screenshot, str):
            # Assume base64-encoded
            try:
                image_bytes = base64.b64decode(screenshot)
            except Exception as e:
                logger.error(f"Failed to decode base64 screenshot: {e}")
                return None
        else:
            image_bytes = screenshot
        
        # Call service with image data (will be stored in Redis)
        response = await self.client.call_service(
            service_type="ocr",
            payload={},  # Empty payload, image_key added by call_service
            timeout=30.0,
            image_data=image_bytes,
            image_extension="png"
        )
        
        if response.success and response.data:
            return response.data.get("results")
        else:
            logger.error(f"OCR service error: {response.error}")
            return None
```

#### 2.4 Update OCR Plugin

**File**: `backend/src/agent/plugins/ocr_plugin.py`

**Changes:**
- Remove singleton pattern
- Accept `StatelessOCRService` in constructor
- Use stateless service instead of direct OCR engine

```python
class OCRPlugin(AgentPlugin):
    def __init__(
        self,
        enabled: bool = True,
        stateless_service: Optional[StatelessOCRService] = None
    ):
        self.enabled = enabled
        self._stateless_service = stateless_service
    
    async def perform_ocr(
        self,
        screenshot: Union[str, bytes]
    ) -> Optional[List[Dict[str, Any]]]:
        """Perform OCR using stateless service."""
        if not self._stateless_service:
            raise RuntimeError("Stateless OCR service not configured")
        
        return await self._stateless_service.perform_ocr(screenshot)
```

#### 2.5 Update Container

**File**: `backend/src/core/container/core_container.py`

```python
# Add service client
service_client = providers.Singleton(
    ServiceClient,
    redis_url=config.services.redis_url
)

# Add stateless OCR service
stateless_ocr_service = providers.Singleton(
    StatelessOCRService,
    service_client=service_client
)
```

#### 2.6 Testing

- [ ] Unit tests for OCR worker
- [ ] Integration tests for service client
- [ ] End-to-end tests (backend → worker → response)
- [ ] Load tests (multiple concurrent requests)
- [ ] Failure tests (worker crashes, Redis down)

**Deliverables:**
- OCR worker fully implemented
- Backend service client integrated
- OCR plugin using stateless service
- Tests passing
- Documentation updated

---

### Phase 3: TTS Worker Implementation (Week 3)

**Goal**: Migrate TTS from singleton service to stateless worker with streaming support

#### 3.1 TTS Worker Development

**File Structure:**
```
services/tts_worker/
├── __init__.py
├── main.py
├── tts_engine.py
├── worker.py
├── config.py
├── requirements.txt
├── Dockerfile
└── README.md
```

**Key Challenges:**
- **Streaming**: TTS generates audio chunks that need to be streamed
- **Sentence Detection**: Worker needs to handle sentence buffering
- **Response Format**: Multiple chunks per request

**Solution**: Use Redis Streams for chunked responses

**Implementation:**

**`worker.py`** - TTS Worker with streaming:
```python
"""
TTS Worker

Processes TTS requests and streams audio chunks back.
"""
import asyncio
import json
import logging
import uuid
from typing import Dict, Any, Optional
import redis.asyncio as redis

from tts_worker.tts_engine import TTSEngine

logger = logging.getLogger(__name__)


class TTSWorker:
    """Stateless TTS service worker with streaming support."""
    
    def __init__(self, redis_url: str, worker_id: str = None):
        self.redis_url = redis_url
        self.worker_id = worker_id or f"tts-{uuid.uuid4().hex[:8]}"
        self._redis: Optional[redis.Redis] = None
        self._tts_engine: Optional[TTSEngine] = None
        self.running = False
    
    async def initialize(self):
        """Initialize worker and TTS engine."""
        self._redis = await redis.from_url(self.redis_url, decode_responses=False)
        
        # Initialize TTS engine
        model_path = os.getenv("TTS_MODEL_PATH")
        if not model_path:
            raise ValueError("TTS_MODEL_PATH environment variable required")
        
        self._tts_engine = TTSEngine(model_path=model_path)
        await self._tts_engine.initialize()
        
        self.running = True
        logger.info(f"TTS Worker {self.worker_id} initialized")
    
    async def process_request(self, request_data: Dict[str, Any]) -> None:
        """
        Process TTS request and stream audio chunks.
        
        Uses Redis Streams to send multiple chunks for a single request.
        """
        request_id = request_data["request_id"]
        text = request_data["payload"]["text"]
        
        try:
            # Stream audio chunks
            chunk_index = 0
            async for audio_chunk in self._tts_engine.synthesize_stream(text):
                # Send chunk via Redis Stream
                await self._redis.xadd(
                    f"tts:stream:{request_id}",
                    {
                        "chunk_index": chunk_index,
                        "audio": audio_chunk["audio"],
                        "sample_rate": audio_chunk["sample_rate"],
                        "sample_width": audio_chunk["sample_width"],
                        "channels": audio_chunk["channels"],
                        "is_final": "false"
                    }
                )
                chunk_index += 1
            
            # Send final marker
            await self._redis.xadd(
                f"tts:stream:{request_id}",
                {
                    "chunk_index": chunk_index,
                    "is_final": "true"
                }
            )
            
            # Publish completion
            await self._redis.publish(
                "service:responses",
                json.dumps({
                    "request_id": request_id,
                    "success": True,
                    "data": {
                        "stream_id": f"tts:stream:{request_id}",
                        "chunk_count": chunk_index
                    }
                })
            )
            
        except Exception as e:
            logger.error(f"TTS processing failed: {e}", exc_info=True)
            await self._redis.publish(
                "service:responses",
                json.dumps({
                    "request_id": request_id,
                    "success": False,
                    "error": str(e)
                })
            )
    
    async def run(self):
        """Main worker loop."""
        while self.running:
            try:
                result = await self._redis.brpop("tts:requests", timeout=5)
                
                if result is None:
                    await self._send_heartbeat()
                    continue
                
                _, message_data = result
                request = json.loads(message_data.decode('utf-8'))
                
                # Process request (streams chunks asynchronously)
                asyncio.create_task(self.process_request(request))
                
            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)
                await asyncio.sleep(1)
```

#### 3.2 Backend TTS Service Client with Streaming

**File**: `backend/src/core/services/stateless_tts_service.py`

```python
"""
Stateless TTS Service with Streaming

Handles TTS requests and streams audio chunks from Redis Streams.
"""
import asyncio
import logging
from typing import AsyncGenerator, Dict, Any, Optional
import redis.asyncio as redis

from backend.src.core.services.service_client import ServiceClient

logger = logging.getLogger(__name__)


class StatelessTTSService:
    """TTS service using stateless workers with streaming support."""
    
    def __init__(self, service_client: ServiceClient, redis_url: str):
        self.client = service_client
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
    
    async def initialize(self):
        """Initialize Redis connection for streaming."""
        self._redis = await redis.from_url(self.redis_url, decode_responses=False)
    
    async def synthesize_stream(
        self,
        text: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Synthesize text and stream audio chunks.
        
        Args:
            text: Text to synthesize
            
        Yields:
            Audio chunk dictionaries
        """
        # Send request to worker
        response = await self.client.call_service(
            service_type="tts",
            payload={"text": text},
            timeout=60.0
        )
        
        if not response.success:
            logger.error(f"TTS service error: {response.error}")
            return
        
        stream_id = response.data["stream_id"]
        
        # Read chunks from Redis Stream
        last_id = "0"
        try:
            while True:
                # Read from stream
                messages = await self._redis.xread(
                    {stream_id: last_id},
                    count=10,
                    block=1000  # 1 second timeout
                )
                
                if not messages:
                    break
                
                stream, stream_messages = messages[0]
                
                for msg_id, fields in stream_messages:
                    last_id = msg_id
                    
                    # Check if final
                    is_final = fields.get(b"is_final", b"false").decode() == "true"
                    
                    if is_final:
                        return
                    
                    # Yield audio chunk
                    yield {
                        "audio": fields[b"audio"].decode(),
                        "sample_rate": int(fields[b"sample_rate"]),
                        "sample_width": int(fields[b"sample_width"]),
                        "channels": int(fields[b"channels"])
                    }
        finally:
            # Cleanup stream
            await self._redis.delete(stream_id)
```

#### 3.3 Update TTS Service Integration

- [ ] Replace `TTSService` with `StatelessTTSService` in container
- [ ] Update `TTSManager` to use stateless service
- [ ] Maintain same API for `QueryHandler` (no changes needed)
- [ ] Update initialization

**Deliverables:**
- TTS worker with streaming support
- Backend integration complete
- Streaming works end-to-end
- Tests passing

---

### Phase 4: Vision Worker Implementation (Week 4)

**Goal**: Migrate Vision service to stateless worker

#### 4.1 Vision Worker Development

**File Structure:**
```
services/vision_worker/
├── __init__.py
├── main.py
├── vision_engine.py
├── worker.py
├── config.py
├── requirements.txt
├── Dockerfile
└── README.md
```

**Key Considerations:**
- **Large Models**: InternVL models are large (~8GB)
- **GPU Memory**: Requires significant VRAM
- **Initialization Time**: Model loading takes time
- **Batch Processing**: Not typically batched (one request at a time)

**Implementation:**

**`vision_engine.py`**:
```python
"""
Vision Engine

Handles InternVL model for UI grounding.
Fetches images from Redis (enables multi-node scaling).
"""
import logging
import base64
from typing import Optional, Tuple
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class VisionEngine:
    """Vision engine for UI grounding using InternVL."""
    
    def __init__(self, model_name: str = "OpenGVLab/InternVL3_5-4B"):
        self.model_name = model_name
        self._model = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize InternVL model (async to avoid blocking)."""
        if self._initialized:
            return
        
        try:
            from backend.src.services.vision.internvl import InternVLModel
            
            # Initialize in thread pool (model loading is blocking)
            loop = asyncio.get_event_loop()
            self._model = await loop.run_in_executor(
                None,
                lambda: InternVLModel(
                    model_name=self.model_name,
                    device="auto",
                    trust_remote_code=True
                )
            )
            
            self._initialized = True
            logger.info(f"Vision engine initialized with {self.model_name}")
        except Exception as e:
            logger.error(f"Failed to initialize vision engine: {e}")
            raise
    
    async def predict_coordinates(
        self,
        redis_client: redis.Redis,
        image_key: str,
        description: str
    ) -> Optional[Tuple[int, int]]:
        """
        Predict click coordinates from description.
        
        Args:
            redis_client: Redis client instance
            image_key: Redis key for image data (e.g., "image:request_123")
            description: Natural language description of element
            
        Returns:
            (x, y) coordinates or None if not found
        """
        if not self._initialized:
            await self.initialize()
        
        try:
            # Fetch image from Redis
            image_bytes = await redis_client.get(image_key)
            if image_bytes is None:
                raise ValueError(f"Image not found in Redis: {image_key}")
            
            # Convert to base64 for model (model expects base64)
            # Note: This is the only base64 conversion needed (model API requirement)
            screenshot_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
            coordinates = await self._model.predict_click_coordinates(
                screenshot_b64,
                description
            )
            return coordinates
        except Exception as e:
            logger.error(f"Vision prediction failed: {e}", exc_info=True)
            return None
```

**`worker.py`** - Vision Worker:
```python
"""
Vision Worker

Processes vision model requests for UI grounding.
Reads images from shared memory (no base64 overhead).
"""
import asyncio
import json
import logging
import uuid
from typing import Dict, Any, Optional
import redis.asyncio as redis
from pathlib import Path

from vision_worker.vision_engine import VisionEngine

logger = logging.getLogger(__name__)


class VisionWorker:
    """Stateless Vision service worker."""
    
    def __init__(self, redis_url: str, worker_id: str = None):
        self.redis_url = redis_url
        self.worker_id = worker_id or f"vision-{uuid.uuid4().hex[:8]}"
        self._redis: Optional[redis.Redis] = None
        self._vision_engine: Optional[VisionEngine] = None
        self.running = False
    
    async def initialize(self):
        """Initialize worker and Vision engine."""
        self._redis = await redis.from_url(self.redis_url, decode_responses=False)
        
        # Initialize Vision engine
        model_name = os.getenv("VISION_MODEL_NAME", "OpenGVLab/InternVL3_5-4B")
        self._vision_engine = VisionEngine(model_name=model_name)
        await self._vision_engine.initialize()
        
        self.running = True
        logger.info(f"Vision Worker {self.worker_id} initialized")
    
    async def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process Vision request."""
        try:
            # Get image key and description from payload
            payload = request_data["payload"]
            image_key = payload.get("image_key")
            description = payload.get("description")
            
            if not image_key:
                return {
                    "success": False,
                    "error": "image_key not found in request payload"
                }
            
            if not description:
                return {
                    "success": False,
                    "error": "description not found in request payload"
                }
            
            # Predict coordinates (fetches from Redis)
            coordinates = await self._vision_engine.predict_coordinates(
                self._redis,
                image_key,
                description
            )
            
            # Note: Redis TTL handles cleanup automatically, no manual deletion needed
            
            if coordinates is None:
                return {
                    "success": False,
                    "error": "Could not find element matching description"
                }
            
            return {
                "success": True,
                "data": {
                    "coordinates": list(coordinates)
                }
            }
        except Exception as e:
            logger.error(f"Vision processing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def run(self):
        """Main worker loop."""
        while self.running:
            try:
                result = await self._redis.brpop("vision:requests", timeout=5)
                
                if result is None:
                    await self._send_heartbeat()
                    continue
                
                _, message_data = result
                request = json.loads(message_data.decode('utf-8'))
                
                logger.debug(
                    f"Worker {self.worker_id} processing request {request['request_id']}"
                )
                
                # Process request
                response_data = await self.process_request(request)
                response_data["request_id"] = request["request_id"]
                
                # Push response to direct reply queue
                reply_to = request.get("reply_to")
                if reply_to:
                    await self._redis.rpush(reply_to, json.dumps(response_data))
                else:
                    logger.warning(f"No reply_to in request {request['request_id']}")
                
                logger.debug(
                    f"Worker {self.worker_id} completed request {request['request_id']}"
                )
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {self.worker_id} error: {e}", exc_info=True)
                await asyncio.sleep(1)
    
    async def _send_heartbeat(self):
        """Send heartbeat to indicate worker is alive."""
        try:
            await self._redis.setex(
                f"worker:heartbeat:vision:{self.worker_id}",
                10,  # 10 second TTL
                json.dumps({
                    "status": "alive",
                    "service": "vision",
                    "worker_id": self.worker_id,
                    "timestamp": asyncio.get_event_loop().time()
                })
            )
        except Exception as e:
            logger.debug(f"Heartbeat failed: {e}")
    
    async def shutdown(self):
        """Shutdown worker gracefully."""
        self.running = False
        if self._redis:
            await self._redis.close()
        logger.info(f"Vision Worker {self.worker_id} shut down")
```

#### 4.2 Backend Vision Service Client

**File**: `backend/src/core/services/stateless_vision_service.py`

```python
"""
Stateless Vision Service

Wrapper for vision model operations via workers.
Uses Redis value storage for image transfer (enables multi-node scaling).
"""
import base64
import logging
from typing import Optional, Tuple, Union

from backend.src.core.services.service_client import ServiceClient

logger = logging.getLogger(__name__)


class StatelessVisionService:
    """Vision service using stateless workers."""
    
    def __init__(self, service_client: ServiceClient):
        self.client = service_client
    
    async def predict_click(
        self,
        screenshot: Union[str, bytes],
        description: str
    ) -> Optional[Tuple[int, int]]:
        """
        Predict click coordinates using stateless service.
        
        Args:
            screenshot: Base64-encoded screenshot string OR binary image data
            description: Natural language description of element to click
            
        Returns:
            (x, y) coordinates or None on error
        """
        # Convert base64 to bytes if needed
        if isinstance(screenshot, str):
            # Assume base64-encoded
            try:
                image_bytes = base64.b64decode(screenshot)
            except Exception as e:
                logger.error(f"Failed to decode base64 screenshot: {e}")
                return None
        else:
            image_bytes = screenshot
        
        # Call service with image data (will be stored in Redis)
        response = await self.client.call_service(
            service_type="vision",
            payload={"description": description},
            timeout=60.0,
            image_data=image_bytes,
            image_extension="png"
        )
        
        if response.success and response.data:
            coords = response.data.get("coordinates")
            if coords and len(coords) == 2:
                return tuple(coords)
        
        logger.error(f"Vision service error: {response.error}")
        return None
```

#### 4.3 Update Vision Service Integration

- [ ] Replace `VisionService` singleton with `StatelessVisionService`
- [ ] Update `ToolPreparer` to use stateless service
- [ ] Update container configuration

**Deliverables:**
- Vision worker implemented
- Backend integration complete
- Coordinate prediction working
- Tests passing

---

### Phase 5: Embedding Worker Implementation (Week 5)

**Goal**: Migrate Embedding service to stateless worker

#### 5.1 Embedding Worker Development

**File Structure:**
```
services/embedding_worker/
├── __init__.py
├── main.py
├── embedding_engine.py
├── worker.py
├── config.py
├── requirements.txt
├── Dockerfile
└── README.md
```

**Key Considerations:**
- **Caching**: Backend should check cache before calling worker
- **Batch Support**: Worker should support batch operations
- **Model Size**: Smaller models (~400MB)
- **High Frequency**: Called frequently for memory operations

**Implementation:**

**`embedding_engine.py`**:
```python
"""
Embedding Engine

Handles SentenceTransformer model for text embeddings.
"""
import logging
from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class EmbeddingEngine:
    """Embedding engine using SentenceTransformers."""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "cuda"):
        self.model_name = model_name
        self.device = device
        self._model = None
        self._dimension = None
    
    def initialize(self):
        """Initialize SentenceTransformer model."""
        if self._model is None:
            self._model = SentenceTransformer(self.model_name, device=self.device)
            self._dimension = self._model.get_sentence_embedding_dimension()
            logger.info(
                f"Embedding engine initialized: {self.model_name} "
                f"(device: {self.device}, dimension: {self._dimension})"
            )
    
    def embed_text(self, text: str) -> np.ndarray:
        """Generate embedding for single text."""
        if self._model is None:
            self.initialize()
        
        return self._model.encode(text, convert_to_numpy=True)
    
    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Generate embeddings for batch of texts."""
        if self._model is None:
            self.initialize()
        
        return self._model.encode(texts, convert_to_numpy=True)
```

**`worker.py`**:
```python
"""
Embedding Worker

Processes embedding requests (single and batch).
"""
# Similar structure to OCR worker
# Supports both embed_text and embed_batch operations
```

#### 5.2 Backend Embedding Service Client with Caching

**File**: `backend/src/core/services/stateless_embedding_service.py`

```python
"""
Stateless Embedding Service with Caching

Checks cache before calling worker, stores results in cache.
"""
import logging
from typing import List, Optional
import numpy as np

from backend.src.core.services.service_client import ServiceClient
from backend.src.core.cache import cache_manager

logger = logging.getLogger(__name__)


class StatelessEmbeddingService:
    """Embedding service using stateless workers with caching."""
    
    def __init__(self, service_client: ServiceClient):
        self.client = service_client
    
    async def embed_text(self, text: str) -> Optional[np.ndarray]:
        """
        Generate embedding with cache check.
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector or None on error
        """
        # Check cache first
        cache_key = cache_manager.get_embedding_key(text)
        cached = cache_manager.embeddings.get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for embedding: {text[:50]}...")
            return cached
        
        # Call worker
        response = await self.client.call_service(
            service_type="embedding",
            payload={"text": text, "operation": "embed_text"},
            timeout=10.0
        )
        
        if response.success and response.data:
            embedding = np.array(response.data["embedding"], dtype=np.float32)
            # Cache result
            cache_manager.embeddings.set(cache_key, embedding)
            return embedding
        else:
            logger.error(f"Embedding service error: {response.error}")
            return None
    
    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """
        Generate embeddings for batch with cache optimization.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        # Separate cached and uncached texts
        embeddings = []
        texts_to_encode = []
        indices_to_encode = []
        
        for i, text in enumerate(texts):
            cache_key = cache_manager.get_embedding_key(text)
            cached = cache_manager.embeddings.get(cache_key)
            if cached is not None:
                embeddings.append((i, cached))
            else:
                texts_to_encode.append(text)
                indices_to_encode.append(i)
        
        # Call worker for uncached texts
        if texts_to_encode:
            response = await self.client.call_service(
                service_type="embedding",
                payload={
                    "texts": texts_to_encode,
                    "operation": "embed_batch"
                },
                timeout=30.0
            )
            
            if response.success and response.data:
                new_embeddings = [
                    np.array(emb, dtype=np.float32)
                    for emb in response.data["embeddings"]
                ]
                
                # Cache new embeddings
                for text, embedding in zip(texts_to_encode, new_embeddings):
                    cache_key = cache_manager.get_embedding_key(text)
                    cache_manager.embeddings.set(cache_key, embedding)
                
                # Add to results
                for idx, embedding in zip(indices_to_encode, new_embeddings):
                    embeddings.append((idx, embedding))
        
        # Sort by original index
        embeddings.sort(key=lambda x: x[0])
        return [emb for _, emb in embeddings]
```

#### 5.3 Update Embedding API Endpoint

**File**: `backend/src/api/routes/embeddings.py`

- [ ] Replace direct `embedder` calls with `StatelessEmbeddingService`
- [ ] Maintain same API contract (no breaking changes)

**Deliverables:**
- Embedding worker implemented
- Backend integration with caching
- API endpoint updated
- Tests passing

---

### Phase 6: Integration & Testing (Week 6)

**Goal**: Complete integration, comprehensive testing, and documentation

#### 6.1 Integration Tasks

- [ ] Update all container configurations
- [ ] Remove old singleton services
- [ ] Update plugin initialization
- [ ] Update service factory methods
- [ ] Configuration management updates

#### 6.2 Comprehensive Testing

**Unit Tests:**
- [ ] Service client request/response handling
- [ ] Worker request processing
- [ ] Error handling and timeouts
- [ ] Retry logic
- [ ] Connection pooling

**Integration Tests:**
- [ ] Backend → Redis → Worker → Response flow
- [ ] Multiple concurrent requests
- [ ] Worker failure recovery
- [ ] Redis connection failures
- [ ] Timeout handling

**Load Tests:**
- [ ] 10 concurrent OCR requests
- [ ] 5 concurrent TTS streams
- [ ] 3 concurrent Vision requests
- [ ] 20 concurrent Embedding requests
- [ ] Mixed workload (all services)

**End-to-End Tests:**
- [ ] Full user query with OCR coordinate resolution
- [ ] TTS streaming during response
- [ ] Vision-based click prediction
- [ ] Memory storage with embeddings

#### 6.3 Performance Benchmarks

**Metrics to Track:**
- Request latency (p50, p95, p99)
- Throughput (requests/second)
- Worker utilization
- Redis queue depth
- Error rates
- Cache hit rates (for embeddings)

**Baseline vs. Target:**
- Current: Single instance, blocking
- Target: <100ms overhead for Redis round-trip
- Target: 3x throughput with 3 workers
- Target: <1% error rate

#### 6.4 Documentation

- [ ] Architecture documentation
- [ ] Worker deployment guide
- [ ] Configuration reference
- [ ] Troubleshooting guide
- [ ] API documentation updates
- [ ] Migration guide for developers

**Deliverables:**
- All services integrated
- Comprehensive test suite
- Performance benchmarks
- Complete documentation

---

### Phase 7: Deployment & Rollout (Week 7)

**Goal**: Deploy to production with zero downtime

#### 7.1 Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Monitoring dashboards ready
- [ ] Rollback plan tested
- [ ] Team training completed

#### 7.2 Deployment Strategy

**Option A: Blue-Green Deployment (Recommended)**
1. Deploy workers alongside existing services
2. Route traffic to workers via feature flag
3. Monitor metrics
4. Gradually increase traffic
5. Remove old services

**Option B: Canary Deployment**
1. Route 10% traffic to workers
2. Monitor for 24 hours
3. Increase to 50%, then 100%
4. Remove old services

#### 7.3 Deployment Steps

1. **Deploy Infrastructure**
   ```bash
   # Deploy Redis
   docker-compose -f services/docker-compose.yml up -d redis
   
   # Verify Redis health
   redis-cli ping
   ```

2. **Deploy Workers**
   ```bash
   # Deploy all workers
   docker-compose -f services/docker-compose.yml up -d
   
   # Verify workers are running
   docker-compose -f services/docker-compose.yml ps
   ```

3. **Update Backend**
   ```bash
   # Deploy backend with service clients
   # Feature flag: USE_STATELESS_SERVICES=false (default)
   ```

4. **Enable Feature Flag**
   ```bash
   # Set environment variable
   export USE_STATELESS_SERVICES=true
   # Restart backend
   ```

5. **Monitor & Validate**
   - Check worker heartbeats
   - Monitor request latency
   - Check error rates
   - Verify functionality

6. **Scale Workers**
   ```bash
   # Scale OCR workers
   docker-compose -f services/docker-compose.yml up -d --scale ocr-worker=3
   ```

#### 7.4 Post-Deployment

- [ ] Monitor for 48 hours
- [ ] Collect performance metrics
- [ ] Address any issues
- [ ] Remove feature flag
- [ ] Remove old singleton code
- [ ] Update documentation

**Deliverables:**
- Production deployment complete
- All services running on workers
- Monitoring in place
- Performance targets met

---

## Service Specifications

### OCR Worker

**Request Format:**
```json
{
  "request_id": "uuid",
  "reply_to": "responses:backend-abc",
  "payload": {
    "image_key": "image:uuid"
  }
}
```

**Note**: Image data is stored in Redis by backend (`SETEX image:uuid 60 <bytes>`). Worker fetches from Redis (`GET image:uuid`). Enables multi-node scaling. Redis TTL handles automatic cleanup.

**Response Format:**
```json
{
  "request_id": "uuid",
  "success": true,
  "data": {
    "results": [
      {
        "id": "0",
        "text": "Submit",
        "confidence": 0.95,
        "bbox": {"x": 100, "y": 200, "width": 80, "height": 30}
      }
    ],
    "count": 1
  }
}
```

**Performance Targets:**
- Latency: <2s for 1920x1080 screenshot
- Throughput: 10 requests/second per worker
- Error Rate: <1%

### TTS Worker

**Request Format:**
```json
{
  "request_id": "uuid",
  "payload": {
    "text": "Hello, how can I help you?"
  }
}
```

**Response Format:**
- Initial response (via pub/sub):
```json
{
  "request_id": "uuid",
  "success": true,
  "data": {
    "stream_id": "tts:stream:uuid",
    "chunk_count": 5
  }
}
```

- Audio chunks (via Redis Stream):
```json
{
  "chunk_index": 0,
  "audio": "base64_encoded_pcm",
  "sample_rate": 22050,
  "sample_width": 2,
  "channels": 1,
  "is_final": "false"
}
```

**Performance Targets:**
- First chunk latency: <500ms
- Streaming latency: <100ms between chunks
- Throughput: 5 requests/second per worker

### Vision Worker

**Request Format:**
```json
{
  "request_id": "uuid",
  "reply_to": "responses:backend-abc",
  "payload": {
    "image_key": "image:uuid",
    "description": "Click on the login button"
  }
}
```

**Note**: Image data is stored in Redis by backend (`SETEX image:uuid 60 <bytes>`). Worker fetches from Redis (`GET image:uuid`). Enables multi-node scaling. Redis TTL handles automatic cleanup.

**Response Format:**
```json
{
  "request_id": "uuid",
  "success": true,
  "data": {
    "coordinates": [500, 300]
  }
}
```

**Performance Targets:**
- Latency: <5s for 1920x1080 screenshot
- Throughput: 2 requests/second per worker
- Error Rate: <2%

### Embedding Worker

**Request Format (Single):**
```json
{
  "request_id": "uuid",
  "payload": {
    "operation": "embed_text",
    "text": "User query text"
  }
}
```

**Request Format (Batch):**
```json
{
  "request_id": "uuid",
  "payload": {
    "operation": "embed_batch",
    "texts": ["text1", "text2", "text3"]
  }
}
```

**Response Format:**
```json
{
  "request_id": "uuid",
  "success": true,
  "data": {
    "embedding": [0.1, 0.2, ...],  // For single
    "embeddings": [[0.1, ...], [0.2, ...], ...]  // For batch
  }
}
```

**Performance Targets:**
- Latency: <200ms for single text
- Latency: <500ms for batch of 10
- Throughput: 20 requests/second per worker
- Cache hit rate: >80%

---

## Backend Integration

### Service Client Initialization

**File**: `backend/src/core/bootstrap/coordinator.py`

```python
async def _initialize_services(self) -> None:
    """Phase 3: Initialize services."""
    # ... existing code ...
    
    # Initialize service client if stateless services enabled
    if self.config.services.stateless_enabled:
        from backend.src.core.services.service_client import ServiceClient
        import os
        instance_id = os.getenv("BACKEND_INSTANCE_ID")  # Unique per backend instance
        service_client = ServiceClient(
            redis_url=self.config.services.redis_url,
            instance_id=instance_id  # For direct reply queues
        )
        await service_client.initialize()
        self.container.service_client = service_client
        logger.info(f"Service client initialized for stateless services (instance_id={instance_id})")
```

### Container Updates

**File**: `backend/src/core/container/core_container.py`

```python
import os

class CoreContainer(containers.DeclarativeContainer):
    # ... existing providers ...
    
    # Service Client (conditional)
    service_client = providers.Singleton(
        lambda cfg: ServiceClient(
            redis_url=cfg.services.redis_url,
            instance_id=os.getenv("BACKEND_INSTANCE_ID")  # Unique per instance
        ) if cfg.services.stateless_enabled else None,
        cfg=config
    )
    
    # Stateless Services (conditional)
    stateless_ocr_service = providers.Singleton(
        lambda sc: StatelessOCRService(sc) if sc else None,
        sc=service_client
    )
    
    stateless_tts_service = providers.Singleton(
        lambda sc, cfg: StatelessTTSService(sc, cfg.services.redis_url) if sc else None,
        sc=service_client,
        cfg=config
    )
    
    stateless_vision_service = providers.Singleton(
        lambda sc: StatelessVisionService(sc) if sc else None,
        sc=service_client
    )
    
    stateless_embedding_service = providers.Singleton(
        lambda sc: StatelessEmbeddingService(sc) if sc else None,
        sc=service_client
    )
    
    # Fallback to old services if stateless disabled
    tts_service = providers.Singleton(
        lambda cfg, sc: StatelessTTSService(sc, cfg.services.redis_url) if sc else _create_tts_service(cfg),
        cfg=config,
        sc=service_client
    )
```

### Plugin Updates

**File**: `backend/src/core/bootstrap/plugin_initializer.py`

```python
async def initialize(self, container: Container) -> PluginRegistry:
    """Initialize plugins with stateless services if enabled."""
    # ... existing code ...
    
    # Get stateless services from container
    if container.config.services.stateless_enabled:
        ocr_plugin = OCRPlugin(
            enabled=True,
            stateless_service=container.stateless_ocr_service
        )
    else:
        # Fallback to singleton
        from backend.src.agent.plugins.ocr_plugin import get_ocr_plugin_instance
        ocr_plugin = get_ocr_plugin_instance()
    
    # ... register plugin ...
```

---

## Migration Strategy

### Feature Flag Approach

**Configuration:**
```yaml
services:
  stateless_enabled: false  # Feature flag
  redis_url: "redis://localhost:6379"
  
  workers:
    ocr:
      replicas: 3
    tts:
      replicas: 2
    vision:
      replicas: 2
    embedding:
      replicas: 2
```

**Code Pattern:**
```python
if config.services.stateless_enabled:
    # Use stateless service
    result = await stateless_service.perform_ocr(screenshot)
else:
    # Use old singleton
    result = await ocr_plugin.perform_ocr(screenshot)
```

### Gradual Migration

1. **Week 1-2**: Deploy workers, keep old services running
2. **Week 3**: Enable for 10% of requests (canary)
3. **Week 4**: Enable for 50% of requests
4. **Week 5**: Enable for 100% of requests
5. **Week 6**: Remove old singleton code

### Backward Compatibility

- Keep HTTP API endpoints unchanged
- Maintain same response formats
- No frontend changes required
- Plugin interfaces remain the same

---

## Testing Strategy

### Unit Tests

**Service Client Tests:**
```python
# backend/tests/services/test_service_client.py

async def test_call_service_success():
    """Test successful service call."""
    client = ServiceClient("redis://localhost:6379")
    await client.initialize()
    
    # Mock worker response
    response = await client.call_service("ocr", {"screenshot": "..."})
    assert response.success
    assert response.data is not None

async def test_call_service_timeout():
    """Test service call timeout."""
    # Test timeout handling

async def test_call_service_error():
    """Test service error handling."""
    # Test error responses
```

**Worker Tests:**
```python
# services/ocr_worker/tests/test_worker.py

async def test_worker_processes_request():
    """Test worker processes OCR request correctly."""
    worker = OCRWorker("redis://localhost:6379")
    await worker.initialize()
    
    result = await worker.process_request({
        "screenshot": "base64_image"
    })
    
    assert result["success"]
    assert "results" in result["data"]
```

### Integration Tests

**End-to-End Tests:**
```python
# tests/integration/test_stateless_services.py

async def test_ocr_end_to_end():
    """Test complete OCR flow: backend → worker → response."""
    # 1. Start worker
    # 2. Backend sends request
    # 3. Worker processes
    # 4. Backend receives response
    # 5. Verify result

async def test_tts_streaming():
    """Test TTS streaming flow."""
    # 1. Backend sends text
    # 2. Worker streams chunks
    # 3. Backend receives all chunks
    # 4. Verify audio playback
```

### Load Tests

**Performance Tests:**
```python
# tests/load/test_service_performance.py

async def test_ocr_concurrent_requests():
    """Test OCR with 10 concurrent requests."""
    tasks = [
        backend.ocr_service.perform_ocr(screenshot)
        for _ in range(10)
    ]
    results = await asyncio.gather(*tasks)
    assert all(r is not None for r in results)

async def test_worker_scaling():
    """Test that adding workers increases throughput."""
    # Measure throughput with 1, 2, 3 workers
    # Verify linear scaling (within reason)
```

### Failure Tests

**Resilience Tests:**
```python
# tests/resilience/test_service_failures.py

async def test_worker_crash_recovery():
    """Test system handles worker crashes."""
    # 1. Start worker
    # 2. Kill worker mid-request
    # 3. Verify timeout and error handling
    # 4. Verify other workers continue

async def test_redis_connection_loss():
    """Test handling of Redis connection loss."""
    # 1. Simulate Redis down
    # 2. Verify graceful degradation
    # 3. Verify reconnection
```

---

## Deployment Plan

### Development Environment

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: >
      redis-server
      --save ""
      --appendonly no
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
    # Disable persistence for request queues (ephemeral data)
    # Enable LRU eviction for image storage (handles memory pressure)

  ocr-worker:
    build: ./services/ocr_worker
    environment:
      - REDIS_URL=redis://redis:6379
      - USE_CUDA=true
      - REDIS_DATA_TTL=60
    deploy:
      replicas: 2
    depends_on:
      - redis

  tts-worker:
    build: ./services/tts_worker
    environment:
      - REDIS_URL=redis://redis:6379
      - TTS_MODEL_PATH=/models/piper/model.onnx
      - REDIS_DATA_TTL=60
    deploy:
      replicas: 2
    depends_on:
      - redis

  vision-worker:
    build: ./services/vision_worker
    environment:
      - REDIS_URL=redis://redis:6379
      - USE_CUDA=true
      - REDIS_DATA_TTL=60
    deploy:
      replicas: 2
    depends_on:
      - redis

  embedding-worker:
    build: ./services/embedding_worker
    environment:
      - REDIS_URL=redis://redis:6379
      - USE_CUDA=true
      - REDIS_DATA_TTL=60
    deploy:
      replicas: 2
    depends_on:
      - redis

volumes:
  redis_data:
```

**Key Changes:**
- **Redis persistence disabled**: `--save "" --appendonly no` (request queues are ephemeral)
- **Redis memory management**: `--maxmemory 2gb --maxmemory-policy allkeys-lru` (handles image storage)
- **No volume mounts needed**: Images stored in Redis, enabling multi-node scaling
- **Environment variable**: `REDIS_DATA_TTL=60` (60 second TTL for image storage)

### Production Deployment

**Kubernetes Deployment (Optional):**
```yaml
# k8s/workers/ocr-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ocr-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ocr-worker
  template:
    metadata:
      labels:
        app: ocr-worker
    spec:
      containers:
      - name: ocr-worker
        image: your-registry/ocr-worker:latest
        env:
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: url
        resources:
          requests:
            memory: "2Gi"
            nvidia.com/gpu: 1
          limits:
            memory: "4Gi"
            nvidia.com/gpu: 1
```

### Health Checks

**Worker Health Endpoint:**
```python
# Each worker exposes health endpoint
@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "worker_id": worker_id,
        "service": "ocr",
        "uptime": time.time() - start_time
    }
```

**Backend Health Check:**
```python
# backend/src/api/routes/health.py

@router.get("/health/services")
async def service_health():
    """Check health of all stateless services."""
    health = {}
    
    for service_type in ["ocr", "tts", "vision", "embedding"]:
        workers = await redis.keys(f"worker:heartbeat:{service_type}:*")
        health[service_type] = {
            "active_workers": len(workers),
            "healthy": len(workers) > 0
        }
    
    return health
```

---

## Monitoring & Observability

### Metrics to Track

**Per Service:**
- Request count (total, success, failure)
- Request latency (p50, p95, p99)
- Queue depth (requests waiting)
- Worker utilization
- Error rates by type

**Infrastructure:**
- Redis connection pool usage
- Redis memory usage
- Worker heartbeats
- Worker restarts

### Logging

**Structured Logging:**
```python
logger.info(
    "Service request completed",
    extra={
        "service": "ocr",
        "request_id": request_id,
        "duration_ms": duration,
        "success": True,
        "worker_id": worker_id
    }
)
```

### Dashboards

**Grafana Dashboards:**
- Service request rates
- Latency percentiles
- Error rates
- Worker health
- Queue depths
- Resource utilization

### Alerts

**Critical Alerts:**
- No active workers for a service
- Error rate > 5%
- P95 latency > 5s
- Redis connection failures
- Worker crash loop

**Warning Alerts:**
- Queue depth > 100
- Worker utilization > 80%
- P95 latency > 2s

---

## Rollback Plan

### Immediate Rollback

**Feature Flag:**
```bash
# Disable stateless services
export USE_STATELESS_SERVICES=false
# Restart backend
```

**Code Rollback:**
- Keep old singleton code for 2 weeks
- Feature flag controls which implementation is used
- No code changes needed for rollback

### Gradual Rollback

1. Reduce traffic to workers (50% → 10% → 0%)
2. Monitor for issues
3. If problems persist, disable feature flag
4. Investigate and fix issues
5. Re-enable when ready

### Data Preservation

- Redis streams are ephemeral (no data loss on rollback)
- Cache remains in backend (no impact)
- No state to migrate back

---

## Success Criteria

### Functional Requirements
- [ ] All services work identically to before
- [ ] No breaking changes to APIs
- [ ] Frontend requires no changes
- [ ] All existing tests pass

### Performance Requirements
- [ ] Latency overhead < 100ms (Redis round-trip)
- [ ] 3x throughput with 3 workers
- [ ] Error rate < 1%
- [ ] 99.9% uptime

### Scalability Requirements
- [ ] Can scale workers independently
- [ ] Can handle 10x current load
- [ ] Worker failures don't affect backend
- [ ] Zero-downtime deployments

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Foundation | Week 1 | Redis setup, ServiceClient framework |
| Phase 2: OCR Worker | Week 2 | OCR worker + backend integration |
| Phase 3: TTS Worker | Week 3 | TTS worker with streaming |
| Phase 4: Vision Worker | Week 4 | Vision worker + integration |
| Phase 5: Embedding Worker | Week 5 | Embedding worker + caching |
| Phase 6: Integration & Testing | Week 6 | Complete testing, documentation |
| Phase 7: Deployment | Week 7 | Production deployment |

**Total Duration: 7 weeks**

---

## Risk Assessment & Mitigation

### High Risk

**Risk**: Worker crashes cause request failures
**Mitigation**: 
- Multiple workers per service
- Automatic retries in service client
- Graceful error handling
- Health checks and auto-restart

**Risk**: Redis becomes single point of failure
**Mitigation**:
- Redis Sentinel for HA
- Connection pooling
- Retry logic
- Fallback to old services (feature flag)

### Medium Risk

**Risk**: Latency increase from Redis overhead
**Mitigation**:
- Optimize Redis configuration
- Use local Redis for development
- Monitor and optimize message sizes
- Batch operations where possible

**Risk**: Worker initialization time
**Mitigation**:
- Pre-warm workers
- Health checks before accepting requests
- Lazy initialization with caching

### Low Risk

**Risk**: Configuration complexity
**Mitigation**:
- Comprehensive documentation
- Default configurations
- Validation and error messages
- Migration guides

---

## Appendix

### A. File Structure

```
ALL_OR_NOTHING/
├── backend/
│   └── src/
│       └── core/
│           └── services/
│               ├── service_client.py          # NEW
│               ├── stateless_ocr_service.py  # NEW
│               ├── stateless_tts_service.py  # NEW
│               ├── stateless_vision_service.py # NEW
│               └── stateless_embedding_service.py # NEW
├── services/                                  # NEW
│   ├── ocr_worker/
│   ├── tts_worker/
│   ├── vision_worker/
│   ├── embedding_worker/
│   ├── docker-compose.yml
│   └── README.md
└── docs/
    └── STATELESS_SERVICES_MIGRATION_PLAN.md  # This file
```

### B. Dependencies

**Backend:**
- `redis` (async): `redis[hiredis]>=5.0.0`
- `numpy`: For embedding arrays

**Workers:**
- `redis` (async)
- `rapidocr`: OCR worker
- `piper-tts`: TTS worker
- `transformers`, `torch`: Vision worker
- `sentence-transformers`: Embedding worker

**Note**: No `aiofiles` needed - Redis handles all data storage/retrieval.

### C. Configuration Reference

**Backend Config:**
```yaml
services:
  stateless_enabled: true
  redis_url: "redis://localhost:6379"
  redis_data_ttl: 60  # TTL for image/data storage (seconds)
  timeout_default: 30.0
  
  workers:
    ocr:
      timeout: 30.0
      replicas: 3
      batch_size: 5  # Process up to 5 images in batch
    tts:
      timeout: 60.0
      replicas: 2
    vision:
      timeout: 60.0
      replicas: 2
    embedding:
      timeout: 10.0
      replicas: 2
      batch_size: 10  # Process up to 10 texts in batch
```

**Worker Environment Variables:**
```bash
REDIS_URL=redis://localhost:6379
WORKER_ID=ocr-1
USE_CUDA=true
REDIS_DATA_TTL=60  # TTL for image/data storage (seconds)
TTS_MODEL_PATH=/models/piper/model.onnx
VISION_MODEL_NAME=OpenGVLab/InternVL3_5-4B
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
BATCH_SIZE=5  # Batch size for processing (OCR, Embeddings)
```

**Redis Configuration:**
```bash
# Disable persistence for request queues (ephemeral data)
# Enable memory management for image storage
redis-server \
  --save "" \
  --appendonly no \
  --maxmemory 2gb \
  --maxmemory-policy allkeys-lru

# Or in redis.conf:
save ""
appendonly no
maxmemory 2gb
maxmemory-policy allkeys-lru
```

---

## Conclusion

This migration plan provides a comprehensive roadmap for transitioning from singleton services to stateless, horizontally-scalable worker services. The phased approach ensures minimal risk, thorough testing, and smooth deployment.

**Key Benefits:**
- Horizontal scaling for multi-user support
- Resource isolation and fault tolerance
- Independent deployment and updates
- Consistent architecture across all services

**Next Steps:**
1. Review and approve this plan
2. Set up development environment
3. Begin Phase 1 implementation
4. Iterate based on learnings

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-03  
**Author**: AI Assistant  
**Status**: Draft - Ready for Review
