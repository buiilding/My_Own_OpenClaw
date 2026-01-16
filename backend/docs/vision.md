# Vision & OCR Services

## Overview

The backend provides vision capabilities through **InternVL** for UI grounding and **RapidOCR** for text detection from screenshots.

## Vision Service (InternVL)

**Location**: `backend/src/services/vision/`

### Purpose

- **UI Grounding**: Predicts click coordinates from natural language
- **Element Detection**: Identifies UI elements in screenshots
- **Vision-Language Understanding**: Combines vision and language models

### Architecture

- **Singleton Pattern**: Single instance shared across requests
- **Pre-initialization**: Model loaded at startup
- **Device Management**: CUDA/CPU support with automatic fallback

### Usage

Used by `mouse_control` tool with `find_coordinates_by="prediction"` for vision-based element detection:

```python
# Tool uses vision service to predict coordinates
vision_service = ctx.services.get("vision_service")
coordinates = await vision_service.predict_click_coordinates(
    screenshot=screenshot_data,
    instruction="Click on the login button"
)
```

### Model Details

- **Model**: InternVL (vision-language model)
- **Initialization**: Async initialization at startup
- **Device**: CUDA if available, CPU fallback
- **Caching**: Model instance cached for performance

## OCR Plugin

**Location**: `backend/src/agent/plugins/ocr_plugin.py`

### Purpose

- **Text Detection**: Extracts text from screenshots
- **Proactive Analysis**: Automatically triggered on screenshots
- **Tool Integration**: Used by `mouse_control` tool with `find_coordinates_by="ocr"` for OCR-based coordinate resolution

### Architecture

- **Plugin System**: Implements AgentPlugin interface
- **Singleton**: Single OCR engine instance
- **Pre-initialization**: OCR engine loaded at startup
- **CUDA Support**: GPU acceleration for faster processing
- **CPU Fallback**: Automatic fallback to CPU if GPU memory is exhausted
- **GPU Memory Management**: Clears GPU cache before/after operations to prevent OOM errors
- **Asynchronous Execution**: OCR runs in a separate thread using `asyncio.to_thread` to prevent blocking the event loop
- **Hardware-Aware Configuration**: Automatically detects GPU memory and CPU cores to optimize batch sizes and thread counts

### Performance Optimizations

The OCR plugin includes several performance optimizations that are automatically applied based on detected hardware:

#### Hardware Detection

- **GPU Memory Detection**: Automatically detects GPU VRAM using PyTorch
- **CPU Core Detection**: Detects physical CPU cores for thread optimization
- **Adaptive Configuration**: Adjusts batch sizes and thread counts based on available hardware

#### Optimized Configuration Parameters

The plugin automatically configures RapidOCR with optimized parameters:

**Safe Optimizations (No Accuracy Loss):**
- **Classification Disabled** (`use_cls=False`): Screenshots are typically upright, so text orientation classification is skipped, saving 30-50% processing time
- **Optimized Batch Sizes**: Automatically set based on GPU memory:
  - 16GB+ VRAM: `rec_batch_num=24`, `cls_batch_num=10`
  - 12-16GB VRAM: `rec_batch_num=10`, `cls_batch_num=6`
  - 8-12GB VRAM: `rec_batch_num=8`, `cls_batch_num=6`
  - <8GB VRAM: `rec_batch_num=6`, `cls_batch_num=4`
- **Thread Optimization**: CPU thread counts optimized based on detected cores:
  - `intra_op_num_threads`: Set to number of physical CPU cores
  - `inter_op_num_threads`: Set to 2-4 (optimized based on core count)

**Parameters Kept at Defaults (For Accuracy):**
- `box_thresh=0.5`: Detection threshold (not increased to preserve accuracy)
- `score_mode="default"`: Not set to "fast" mode (preserves accuracy)
- `max_candidates=1000`: Not reduced (ensures all text regions are detected)
- All detection thresholds unchanged

#### Performance Results

With optimizations enabled:
- **Before**: ~5-6 seconds per screenshot
- **After**: ~2.5-3 seconds per screenshot
- **Improvement**: ~2x faster with no accuracy loss

#### Configuration Logging

On startup, the plugin logs all configuration parameters for verification:

```
[OCR] Hardware detected: GPU 15.9GB VRAM, 27 CPU cores. Using batch sizes: rec=24, cls=10
[OCR] Configuration parameters:
  Global: use_det=True, use_cls=False, use_rec=True, text_score=0.5, max_side_len=2000, min_side_len=30
  Engine: use_cuda=True, intra_op_threads=27, inter_op_num_threads=4
  Detection: limit_side_len=736, thresh=0.3, box_thresh=0.5, max_candidates=1000, score_mode=default
  Classification: cls_batch_num=10, cls_thresh=0.9
  Recognition: rec_batch_num=24
```

#### Manual Tuning

If you need to adjust batch sizes manually, modify the `_build_ocr_params()` method in `backend/src/agent/plugins/ocr_plugin.py`. The current settings are optimized for 16GB VRAM GPUs. For GPUs with more VRAM, you can safely increase `rec_batch_num` further (e.g., 28-32) as long as no OOM errors occur.

### Proactive OCR

**Location**: `backend/src/api/handlers/tool_result_handler.py`

**Critical Behavior**: When a screenshot arrives at the backend, proactive OCR is **immediately activated** and runs **asynchronously** without blocking any other operations (LLM coordination, LLM response generation, tool result processing).

When backend receives a screenshot:

1. Screenshot stored in session (`latest_screenshot`)
2. OCR completion event cleared (signals OCR in progress)
3. OCR plugin triggered asynchronously in background thread via `asyncio.create_task()` (non-blocking)
4. OCR runs in separate thread using `asyncio.to_thread()` (doesn't block event loop)
5. OCR results stored in session (`latest_ocr_results`)
6. OCR completion event set (signals OCR complete)
7. Results available for subsequent tool calls

**Synchronization**: The `ocr_completion_event` (`asyncio.Event`) ensures that tools requiring OCR results wait for proactive OCR to complete before using `latest_ocr_results`.

**Tool Waiting Behavior**: If an LLM response includes a click tool with `find_coordinates_by="ocr"`, the tool **waits for OCR completion** via `ocr_completion_event` before extracting text coordinates. The `OcrCoordinator.get_ocr_results()` method blocks on `await session.ocr_completion_event.wait()` until proactive OCR completes, ensuring the tool uses the updated OCR list with the latest results.

### OCR Flow

```
1. Tool execution returns screenshot
   ↓
2. Backend receives tool result
   ↓
3. Backend triggers proactive OCR (async, non-blocking)
   ↓
4. OCR runs in separate thread (doesn't block event loop)
   ↓
5. OCR results stored in session
   ↓
6. OCR completion event set
   ↓
7. Results available for next tool call
```

**Key Benefits**:
- **Immediate Activation**: OCR starts as soon as screenshot arrives, no delay
- **Non-blocking**: OCR doesn't delay tool result processing or LLM communication
- **Parallelism**: LLM can generate responses while OCR processes in background (LLM response generation is NOT blocked by OCR)
- **Synchronization**: Tools that need OCR results wait for completion before extracting coordinates (ensures they use the latest OCR list)

### OCR Result Format

```json
{
  "id": "0",
  "text": "Login",
  "confidence": 0.95,
  "bbox": {
    "x": 500,
    "y": 300,
    "width": 100,
    "height": 30
  }
}
```

### Tool Integration

**Location**: `backend/src/agent/tools/tool_preparer.py`

The `ToolPreparer` handles coordinate resolution for `mouse_control` tools using OCR:

1. **Intercepts** `mouse_control` calls with `find_coordinates_by="ocr"`
2. **Waits** for proactive OCR to complete via `ocr_completion_event`
3. **Searches** OCR results for matching text (fuzzy matching, threshold 0.8)
4. **Resolves** coordinates (center of bounding box)
5. **Rewrites** tool call to use manual coordinates (`x`, `y`)
6. **Sends** rewritten tool call to frontend (frontend only accepts manual coordinates)

**Error Handling**: If coordinate resolution fails (text not found, OCR error, etc.):
- Creates synthetic `ToolResult` with error message
- Yields `ToolOutputEvent` immediately for frontend display
- Stores result in `session._pending_tool_results` for orchestrator
- LLM receives error as tool output and can generate appropriate response

**Example Flow**:
```python
# LLM calls: mouse_control(action="click", find_coordinates_by="ocr", ocr_text="Login")
# ↓
# ToolPreparer intercepts, waits for OCR completion
# ↓
# Searches latest_ocr_results for "Login"
# ↓
# Finds match, calculates center coordinates: (x=500, y=300)
# ↓
# Rewrites to: mouse_control(action="click", x=500, y=300)
# ↓
# Sends to frontend for execution
```

## Screenshot Processing

### Screenshot Sources

1. **Tool Results**: Screenshots automatically captured by frontend after tool execution
2. **User Messages**: Screenshots included in user queries
3. **Tool Requests**: Explicit screenshot requests (rare)

### Screenshot Storage

- **Session Storage**: Latest screenshot stored in session
- **History Integration**: Screenshots included in conversation history
- **Multimodal Format**: Screenshots sent to LLM as multimodal content

### Screenshot Format

- **Base64 Encoding**: Screenshots encoded as base64 strings
- **Data URL Format**: `data:image/png;base64,...`
- **PNG Format**: Standard PNG format
- **Color Format**: Screenshots are converted from BGR (Blue-Green-Red) to RGB format before encoding. The frontend uses nut-js which returns BGR pixel data by default, and converts it to RGB using the `toRGB()` method (or manual channel swapping as fallback) to ensure correct color representation for the LLM.

## Vision Tool Integration

### mouse_control Tool with Vision (find_coordinates_by="prediction")

Uses InternVL to predict click coordinates:

1. LLM calls `mouse_control` with `find_coordinates_by="prediction"` and `description` parameter
2. ToolPreparer intercepts and ensures screenshot is available
3. Uses vision service to predict coordinates from screenshot and description
4. Rewrites tool call to use manual coordinates (x, y)
5. Frontend executes mouse action at predicted coordinates

### mouse_control Tool with OCR (find_coordinates_by="ocr")

Uses OCR to find elements by text:

1. LLM calls `mouse_control` with `find_coordinates_by="ocr"` and `ocr_text` parameter
2. ToolPreparer intercepts and waits for proactive OCR to complete
3. Searches OCR results for matching text (fuzzy matching)
4. Calculates center coordinates of matching bounding box
5. Rewrites tool call to use manual coordinates (x, y)
6. Frontend executes mouse action at OCR-resolved coordinates

## GPU Memory Management

**Location**: `backend/src/core/services/gpu_memory_manager.py`

### Purpose

The GPU Memory Manager coordinates GPU memory usage across multiple services (TTS, OCR, Vision, Embeddings) to prevent out-of-memory (OOM) errors when multiple services compete for GPU memory.

### Features

- **Cache Clearing**: Clears PyTorch CUDA cache before/after operations
- **Memory Logging**: Tracks GPU memory usage for debugging
- **Service Coordination**: Prevents memory conflicts between services

### How It Works

1. **Before Operations**: Clears unused GPU memory to free up space
2. **During Operations**: Services use GPU memory as needed
3. **After Operations**: Clears temporary buffers to free memory for other services

### Integration

- **TTS Service**: Clears cache before/after synthesis
- **OCR Plugin**: Clears cache before/after analysis
- **Embedding Service**: Clears cache before/after embedding generation
- **Tool Result Handler**: Clears cache before proactive OCR

### CPU Fallback

Both TTS and OCR services automatically fall back to CPU if GPU memory allocation fails:
- **TTS**: Detects CUDA errors, reloads model with CPU, retries synthesis
- **OCR**: Detects CUDA errors, reloads engine with CPU, retries analysis
- **Logging**: Successful fallbacks logged at DEBUG level; only failures logged as ERROR

## Performance Considerations

1. **Pre-initialization**: Models loaded at startup for fast inference
2. **CUDA Support**: GPU acceleration for faster processing
3. **CPU Fallback**: Automatic fallback to CPU if GPU memory is exhausted
4. **GPU Memory Management**: Cache clearing prevents OOM errors
5. **Asynchronous Processing**: OCR runs in separate thread using `asyncio.to_thread`, doesn't block event loop
6. **Non-blocking Tool Results**: Tool results processed immediately, OCR runs in parallel
7. **Parallel LLM Communication**: LLM can generate responses while OCR processes screenshots
8. **Caching**: Model instances cached for reuse
9. **No Reinitialization**: Cache clearing doesn't require model reloading
10. **Event-based Synchronization**: `ocr_completion_event` ensures tools wait for OCR when needed without polling
11. **Hardware-Aware Optimization**: OCR automatically optimizes batch sizes and thread counts based on detected GPU memory and CPU cores
12. **Classification Skipped**: Text orientation classification disabled for screenshots (saves 30-50% processing time)
13. **Optimized Batch Processing**: Larger batch sizes (up to 24) for better GPU utilization on high-memory GPUs

## Important Notes

1. **No Screenshot Capture**: Backend never captures screenshots
2. **Receives Screenshots**: Backend receives screenshots from frontend
3. **Proactive OCR**: OCR automatically triggered on screenshots
4. **Vision Service**: InternVL pre-initialized at startup
5. **OCR Plugin**: RapidOCR pre-initialized at startup
6. **GPU Memory**: Services coordinate GPU memory usage to prevent conflicts
7. **CPU Fallback**: Services gracefully degrade to CPU if GPU memory is exhausted
