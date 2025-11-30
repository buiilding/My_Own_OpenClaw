# Vision Services

This guide provides comprehensive documentation for the Personal Assistant's vision services, enabling AI-powered visual understanding and interaction capabilities through advanced vision-language models.

## Overview

The vision services system provides sophisticated computer vision capabilities that enable the AI assistant to:

- Understand visual content on screens and images
- Locate and identify UI elements through natural language descriptions
- Extract text from images using OCR
- Predict clickable regions and coordinates
- Process visual information for enhanced decision-making
- Support multimodal interactions combining vision and language

## Architecture

The vision system is built on multiple integrated components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vision        │    │   Coordinate    │    │   Image         │
│   Models        │◄──►│   Processing    │◄──►│   Processing    │
│   (InternVL)    │    │   Engine        │    │   Pipeline      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Predict Click │    │   Click OCR     │    │   Screenshot    │
│   Tool          │    │   Tool          │    │   Analysis      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### InternVL Integration

The vision system primarily uses InternVL (Internet Vision-Language) models for advanced visual understanding.

```python
from backend.src.services.vision.internvl import InternVLModel

# Initialize vision model
model = InternVLModel(
    model_name="OpenGVLab/InternVL-Chat-V1-5",
    device="cuda",  # or "cpu"
    trust_remote_code=True
)

# Load model
await model.load_model()
```

**Supported Models:**
- **OpenGVLab/InternVL-Chat-V1-5**: Latest chat-optimized vision model
- **OpenGVLab/InternVL-Chat-V1-2**: Balanced performance model
- **OpenGVLab/InternVL-Chat-V1-1**: Lightweight model for resource-constrained environments

**Actual Implementation:**
```python
from backend.src.services.vision.internvl import InternVLModel

# Initialize with actual model names
model = InternVLModel(
    model_name="OpenGVLab/InternVL-Chat-V1-5",
    device="cuda",  # or "cpu", "auto"
    trust_remote_code=True
)

# Load model with device placement and error handling
await model._load()  # Private method that handles CUDA/CPU fallback
```

### Coordinate Processing

Advanced coordinate extraction and processing for UI interactions.

```python
from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
    normalize_coordinates
)

# Extract coordinates from vision model output
point = extract_first_point(model_output)
bbox = extract_last_bbox(model_output)

# Convert normalized coordinates to pixels
pixel_coords = scale_norm_to_pixels(
    normalized_coords=(0.5, 0.3),
    image_size=(1920, 1080)
)

# Normalize pixel coordinates
normalized = normalize_coordinates(
    pixel_coords=(960, 324),
    image_size=(1920, 1080)
)
```

**Coordinate Functions:**
- `extract_first_point()`: Extract first clickable point from model output
- `extract_last_bbox()`: Extract last bounding box from model output
- `scale_norm_to_pixels()`: Convert normalized coordinates to pixels
- `normalize_coordinates()`: Convert pixel coordinates to normalized values

### Image Processing Pipeline

Comprehensive image preprocessing and analysis pipeline.

```python
from PIL import Image
import torchvision.transforms as T

# Image preprocessing
transform = T.Compose([
    T.Resize((448, 448)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# Process image for model input
processed_image = transform(image)
```

## Vision Model Operations

### Point Prediction

Predict precise coordinates for clicking based on natural language descriptions using InternVL model.

```python
# Predict click coordinates with base64 image
coordinates = await model.predict_click_coordinates(
    image_b64=base64_screenshot,
    instruction="Click on the save button in the dialog"
)

# Returns tuple of (x, y) pixel coordinates or None if failed
if coordinates:
    x, y = coordinates
    # Perform click at coordinates
else:
    # Handle prediction failure
    pass
```

**Implementation Details:**
- Uses InternVL chat interface for grounding tasks
- Handles dynamic image preprocessing with aspect ratio optimization
- Supports both point extraction and bounding box parsing
- Includes CUDA/CPU fallback and comprehensive error handling

**Point Prediction Features:**
- Natural language element description
- Precise coordinate prediction
- Confidence scoring
- Multiple candidate detection

### Bounding Box Detection

Detect rectangular regions containing specific elements.

```python
# Detect element bounding boxes
bboxes = await model.detect_elements(
    image=screenshot_image,
    instruction="Find all buttons on the page"
)

for bbox in bboxes:
    x1, y1, x2, y2 = bbox.coordinates
    label = bbox.label
    confidence = bbox.confidence
```

### Text Region Analysis

Identify and extract text regions from images.

```python
# Extract text regions
text_regions = await model.extract_text_regions(
    image=screenshot_image
)

for region in text_regions:
    bbox = region.bbox
    text = region.text
    confidence = region.confidence
```

## Tool Integrations

### PredictClickTool

AI-powered element detection and clicking based on natural language descriptions.

```python
from backend.src.tools.computer.predict_click_tool import PredictClickTool

class PredictClickArgs(BaseModel):
    description: str
    action: Literal["single_click", "double_click", "right_click"] = "single_click"
    confidence_threshold: float = 0.7

class PredictClickTool(Tool[PredictClickArgs]):
    name = "predict_click"
    description = "Use AI vision to predict and click on UI elements"

    async def run(self, args: PredictClickArgs, ctx: Context) -> Dict[str, Any]:
        # Take screenshot
        screenshot = await ctx.computer_interface.take_screenshot()

        # Use vision model to find element
        result = await self.vision_model.predict_click(
            image=screenshot.image,
            instruction=args.description
        )

        if result.success and result.confidence > args.confidence_threshold:
            # Perform click action
            await ctx.computer_interface.click_mouse(
                x=result.coordinates[0],
                y=result.coordinates[1]
            )

            return {
                "success": True,
                "message": f"Clicked on element: {args.description}",
                "coordinates": result.coordinates,
                "confidence": result.confidence
            }

        return {
            "success": False,
            "message": "Could not find element with sufficient confidence"
        }
```

**Usage Examples:**
```json
{
  "description": "Click the blue submit button",
  "action": "single_click",
  "confidence_threshold": 0.8
}
```

```json
{
  "description": "Double-click on the file named 'report.pdf'",
  "action": "double_click"
}
```

### Vision-Enhanced OCR

Combining vision models with OCR for improved text detection.

```python
# Traditional OCR
ocr_text = await interface.extract_text_from_region(region)

# Vision-enhanced OCR
vision_result = await model.extract_text_regions(image)
for region in vision_result.regions:
    enhanced_text = await model.refine_ocr_text(
        image=image,
        bbox=region.bbox,
        initial_text=region.raw_text
    )
```

## Model Management

### Model Loading and Caching

Efficient model loading with caching for performance.

```python
from backend.src.services.vision.model_cache import VisionModelCache

# Initialize cache
cache = VisionModelCache(max_models=2, max_memory_gb=8)

# Load model with caching
model = await cache.get_or_load_model(
    model_name="OpenGVLab/InternVL-Chat-V1-5",
    device="cuda"
)
```

### Memory Management

Optimized memory usage for vision models.

```python
# Check model memory requirements
memory_info = model.get_memory_requirements()
print(f"Model requires: {memory_info['gpu_memory_gb']}GB GPU memory")

# Unload model when not needed
await model.unload()

# Automatic memory management
with model.automatic_memory_management():
    result = await model.predict_click(image, instruction)
    # Model automatically manages GPU memory
```

## Configuration

Vision services are configured through the application config system:

```yaml
vision:
  enabled: true
  model_name: "OpenGVLab/InternVL-Chat-V1-5"
  device: "cuda"  # "cpu", "cuda", "auto"
  trust_remote_code: true
  max_models_in_memory: 2
  max_memory_usage_gb: 8
  confidence_threshold: 0.7
  cache_enabled: true
  cache_ttl_seconds: 3600

coordinate_processing:
  scale_method: "linear"  # "linear", "sigmoid", "custom"
  normalization_range: [0.0, 1.0]
  pixel_precision: 1
  bbox_overlap_threshold: 0.5

image_processing:
  max_image_size: 2048
  supported_formats: ["PNG", "JPEG", "BMP"]
  preprocessing_enabled: true
  enhancement_filters: ["contrast", "sharpness"]
```

## Performance Optimization

### Model Optimization

- **Quantization**: Reduced precision for faster inference
- **Model Distillation**: Smaller models with maintained accuracy
- **Caching**: Result caching for repeated queries
- **Batch Processing**: Process multiple images simultaneously

### Hardware Acceleration

```python
# GPU acceleration
model = InternVLModel(model_name="model", device="cuda")

# CPU optimization
model = InternVLModel(model_name="model", device="cpu")

# Auto device selection
model = InternVLModel(model_name="model", device="auto")
```

### Memory Optimization

```python
# Gradient checkpointing for memory efficiency
model.enable_gradient_checkpointing()

# Model parallelism for large models
model.enable_model_parallelism(num_gpus=2)

# Automatic mixed precision
model.enable_automatic_mixed_precision()
```

## Error Handling and Fallbacks

### Graceful Degradation

```python
async def predict_click_with_fallback(
    image: Image.Image,
    instruction: str
) -> Dict[str, Any]:

    try:
        # Try vision model first
        result = await vision_model.predict_click(image, instruction)
        if result.success and result.confidence > 0.7:
            return result

    except Exception as e:
        logger.warning(f"Vision model failed: {e}")

    try:
        # Fallback to OCR-based approach
        ocr_result = await ocr_fallback(image, instruction)
        if ocr_result.success:
            return ocr_result

    except Exception as e:
        logger.warning(f"OCR fallback failed: {e}")

    # Final fallback to manual coordinate estimation
    return manual_fallback(instruction)
```

### Error Types and Handling

- **ModelLoadingError**: Model download or initialization failure
- **InferenceError**: Model inference failure
- **MemoryError**: GPU/CPU memory exhaustion
- **CoordinateError**: Invalid coordinate extraction
- **ConfidenceError**: Low confidence results

## Integration Examples

### Computer Control Integration

```python
# Complete vision-guided computer interaction
async def intelligent_click(description: str) -> bool:
    # Capture screen
    screenshot = await computer_interface.take_screenshot()

    # Use vision to find element
    vision_result = await vision_model.predict_click(
        image=screenshot.image,
        instruction=description
    )

    if vision_result.success:
        # Perform click
        await computer_interface.click_mouse(
            x=vision_result.coordinates[0],
            y=vision_result.coordinates[1]
        )
        return True

    return False
```

### Multimodal Agent Reasoning

```python
# Combine vision with LLM reasoning
async def analyze_screen_with_reasoning(screen_description: str) -> str:
    # Capture screen
    screenshot = await computer_interface.take_screenshot()

    # Get vision analysis
    vision_analysis = await vision_model.analyze_image(
        image=screenshot.image,
        question="What do you see on this screen?"
    )

    # Use LLM to reason about the analysis
    llm_response = await llm_client.generate_response(
        prompt=f"Screen analysis: {vision_analysis}\n\nUser question: {screen_description}",
        context=conversation_history
    )

    return llm_response
```

## Monitoring and Metrics

### Performance Metrics

```python
# Track vision model performance
metrics = vision_model.get_performance_metrics()

print(f"Average inference time: {metrics['avg_inference_time_ms']}ms")
print(f"Memory usage: {metrics['memory_usage_mb']}MB")
print(f"Cache hit rate: {metrics['cache_hit_rate']}%")
print(f"Error rate: {metrics['error_rate']}%")
```

### Health Checks

```python
# Vision system health check
async def vision_health_check() -> Dict[str, Any]:
    health = {
        "model_loaded": vision_model.is_loaded(),
        "memory_available": vision_model.check_memory(),
        "gpu_available": torch.cuda.is_available(),
        "cache_status": cache.get_status()
    }

    # Test inference with dummy image
    test_image = Image.new('RGB', (224, 224), color='white')
    try:
        test_result = await vision_model.predict_click(
            test_image, "Click anywhere"
        )
        health["inference_working"] = True
    except Exception as e:
        health["inference_working"] = False
        health["inference_error"] = str(e)

    return health
```

## Troubleshooting

### Common Issues

#### Model Loading Failures

```python
# Check dependencies
try:
    import torch
    import transformers
    import timm
    print("All dependencies available")
except ImportError as e:
    print(f"Missing dependency: {e}")

# Check model availability
from huggingface_hub import HfApi
api = HfApi()
models = api.list_models(author="OpenGVLab")
print("Available InternVL models:", [m.id for m in models])
```

#### Memory Issues

```python
# Check GPU memory
if torch.cuda.is_available():
    print(f"GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")

# Reduce model size
model = InternVLModel(
    model_name="OpenGVLab/InternVL-Chat-V1-2",  # Smaller model
    device="cpu"  # Use CPU if GPU memory insufficient
)
```

#### Low Accuracy Issues

```python
# Improve confidence threshold
result = await model.predict_click(image, instruction)
if result.confidence < 0.8:
    print("Low confidence - consider different instruction")

# Try different instructions
instructions = [
    "Click the blue button",
    "Click the button labeled 'Submit'",
    "Click the button with the checkmark icon"
]

for instruction in instructions:
    result = await model.predict_click(image, instruction)
    if result.confidence > 0.9:
        break
```

## API Reference

### InternVLModel Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `_load()` | Load InternVL model and tokenizer | - | `None` |
| `predict_click_coordinates()` | Predict click coordinates | `image_b64, instruction` | `Optional[Tuple[int, int]]` |
| `_dynamic_preprocess()` | Preprocess image into patches | `image, min_num, max_num, image_size` | `List[Image]` |
| `_images_to_pixel_values()` | Convert images to pixel values | `images, input_size, max_num` | `Tuple[torch.Tensor, List[int]]` |
| `_build_transform()` | Build image transformation pipeline | `input_size` | `torchvision.transforms.Compose` |

### Coordinate Processing Functions

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `extract_first_point()` | Extract first point | `model_output` | `Tuple[int, int]` |
| `extract_last_bbox()` | Extract last bounding box | `model_output` | `Tuple[int, int, int, int]` |
| `scale_norm_to_pixels()` | Normalize to pixels | `coords, image_size` | `Tuple[int, int]` |
| `normalize_coordinates()` | Pixels to normalized | `coords, image_size` | `Tuple[float, float]` |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable vision services |
| `model_name` | str | `"OpenGVLab/InternVL-Chat-V1-5"` | Vision model to use |
| `device` | str | `"cuda"` | Computation device |
| `confidence_threshold` | float | `0.7` | Minimum confidence for predictions |
| `max_models_in_memory` | int | `2` | Maximum cached models |
| `cache_enabled` | bool | `true` | Enable result caching |

This vision services system provides the AI assistant with powerful visual understanding capabilities, enabling sophisticated screen interaction and multimodal reasoning for enhanced user assistance.</contents>
</xai:function_call">
