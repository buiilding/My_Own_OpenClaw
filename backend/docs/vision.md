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

Used by `predict_click` tool for vision-based element detection:

```python
# Tool uses vision service to predict coordinates
vision_service = ctx.services.get("vision_service")
coordinates = await vision_service.predict_click(
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
- **Tool Integration**: Used by `click_ocr_element` tool

### Architecture

- **Plugin System**: Implements AgentPlugin interface
- **Singleton**: Single OCR engine instance
- **Pre-initialization**: OCR engine loaded at startup
- **CUDA Support**: GPU acceleration for faster processing
- **CPU Fallback**: Automatic fallback to CPU if GPU memory is exhausted
- **GPU Memory Management**: Clears GPU cache before/after operations to prevent OOM errors

### Proactive OCR

**Location**: `backend/src/api/handlers/tool_result_handler.py`

When backend receives a screenshot:

1. Screenshot stored in session (`latest_screenshot`)
2. OCR plugin triggered asynchronously
3. OCR results stored in session (`latest_ocr_results`)
4. Results available for subsequent tool calls

### OCR Flow

```
1. Tool execution returns screenshot
   ↓
2. Backend receives tool result
   ↓
3. Backend triggers proactive OCR (async)
   ↓
4. OCR plugin analyzes screenshot
   ↓
5. OCR results stored in session
   ↓
6. Results available for next tool call
```

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

**Location**: `backend/src/agent/tool_preparer.py`

Tools can use OCR results for coordinate finding:

```python
# Tool uses OCR to find coordinates
ocr_results = session.latest_ocr_results
coordinates = find_coordinates_by_text(ocr_results, "Login")
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

## Vision Tool Integration

### predict_click Tool

Uses InternVL to predict click coordinates:

1. Receives screenshot and instruction
2. Uses vision service to predict coordinates
3. Returns predicted coordinates
4. Tool execution uses coordinates

### click_ocr_element Tool

Uses OCR to find elements by text:

1. Receives screenshot and text to find
2. Uses OCR results (proactive or on-demand)
3. Finds matching text element
4. Returns coordinates
5. Tool execution uses coordinates

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
5. **Async Processing**: OCR processing doesn't block tool execution
6. **Caching**: Model instances cached for reuse
7. **No Reinitialization**: Cache clearing doesn't require model reloading

## Important Notes

1. **No Screenshot Capture**: Backend never captures screenshots
2. **Receives Screenshots**: Backend receives screenshots from frontend
3. **Proactive OCR**: OCR automatically triggered on screenshots
4. **Vision Service**: InternVL pre-initialized at startup
5. **OCR Plugin**: RapidOCR pre-initialized at startup
6. **GPU Memory**: Services coordinate GPU memory usage to prevent conflicts
7. **CPU Fallback**: Services gracefully degrade to CPU if GPU memory is exhausted
