# Backend Services

## Overview

The backend provides several core services for text-to-speech, GPU memory management, and system operations.

## TTS Service

**Location**: `backend/src/core/services/tts_service.py`

### Purpose

Real-time text-to-speech synthesis using Piper TTS for local, low-latency audio generation.

### Architecture

- **Singleton Pattern**: Single TTS service instance shared across requests
- **Pre-initialization**: Piper model loaded at startup
- **Background Threading**: Synthesis runs in background thread to avoid blocking
- **CUDA Support**: GPU acceleration for faster synthesis
- **CPU Fallback**: Automatic fallback to CPU if GPU memory is exhausted

### Features

- **Sentence Detection**: Automatically detects sentence boundaries
- **Streaming Audio**: Generates audio chunks in real-time
- **GPU Memory Management**: Clears GPU cache before/after synthesis
- **Error Recovery**: Automatically falls back to CPU on GPU errors

### Initialization

```python
# TTS service initialized at container startup
tts_service = container.tts_service()
await tts_service.initialize()
```

### Usage

```python
# Process text for synthesis
await tts_service.process_text("Hello, world!")

# Flush remaining text
await tts_service.flush()

# Shutdown
await tts_service.shutdown()
```

### GPU Memory Management

The TTS service integrates with GPU Memory Manager:
- Clears GPU cache before synthesis to free memory
- Clears GPU cache after synthesis to free memory for other services
- Automatically falls back to CPU if GPU allocation fails

### CPU Fallback Behavior

When GPU memory allocation fails:
1. Detects CUDA error (ONNXRuntimeError, memory allocation failures)
2. Reloads Piper model with CPU (`use_cuda=False`)
3. Retries synthesis with CPU
4. Logs at DEBUG level for successful fallbacks
5. Only logs ERROR if CPU fallback also fails

### Configuration

- **tts_enabled**: Always `True` (hardcoded, not configurable)
- **tts_model_path**: Path to Piper ONNX model file
- **speech_mode_enabled**: Controls whether TTS audio is actually generated

## GPU Memory Manager

**Location**: `backend/src/core/services/gpu_memory_manager.py`

### Purpose

Centralized GPU memory management to prevent out-of-memory (OOM) errors when multiple services compete for GPU memory.

### Features

- **PyTorch Cache Clearing**: Clears `torch.cuda.empty_cache()`
- **Memory Information**: Provides GPU memory usage statistics
- **Service Coordination**: Prevents memory conflicts between services

### API

```python
from backend.src.core.services.gpu_memory_manager import GPUMemoryManager

# Clear all GPU caches
GPUMemoryManager.clear_all_caches()

# Get memory information
info = GPUMemoryManager.get_memory_info()
# Returns: {
#   "total_gb": 8.0,
#   "allocated_gb": 2.5,
#   "reserved_gb": 3.0,
#   "free_gb": 5.0,
#   "usage_percent": 37.5
# }

# Log memory information
GPUMemoryManager.log_memory_info("before OCR")
```

### How It Works

`torch.cuda.empty_cache()` only clears **unused/freed** GPU memory:
- **Does NOT** unload models or services
- **Does NOT** require reinitialization
- **Does NOT** affect memory currently in use
- **Only** frees temporary buffers and fragmented memory

### Integration

Services integrate GPU memory management:
- **TTS**: Clears cache before/after synthesis
- **OCR**: Clears cache before/after analysis
- **Embeddings**: Clears cache before/after embedding generation

### Performance Impact

- **No Reinitialization**: Models stay loaded, no overhead
- **Faster Operations**: Models ready immediately
- **Better Memory Management**: Prevents allocation failures
- **No Service Restart**: Everything stays initialized

## Service Lifecycle

### Startup

1. Services initialized at container startup
2. Models loaded into GPU memory (if CUDA available)
3. Services ready for use

### Runtime

1. Services process requests
2. GPU cache cleared before operations
3. Operations execute
4. GPU cache cleared after operations
5. Memory freed for other services

### Shutdown

1. Services flush remaining work
2. Models remain in memory until process exit
3. GPU memory automatically freed by CUDA runtime
