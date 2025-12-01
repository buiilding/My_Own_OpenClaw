# Computer Control Tools

This guide provides comprehensive documentation for the Personal Assistant's computer control capabilities, enabling the AI agent to interact with the desktop environment through mouse, keyboard, screen capture, and OCR functionality.

## Overview

The computer control system provides low-level desktop automation capabilities based on the Computer-Using Agent (CUA) library. It enables the AI assistant to:

- Control mouse movements and clicks
- Simulate keyboard input
- Capture screenshots
- Extract text from screen regions via OCR
- Perform scrolling operations
- Interact with UI elements through coordinate-based actions

For advanced AI-powered visual interactions, see **[Vision Services](vision_services.md)** which provides AI vision models for intelligent element detection and interaction.

## Architecture

The computer control system consists of several integrated components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Computer      │    │   Vision        │    │   OCR           │
│   Interface     │◄──►│   Services      │◄──►│   Engine        │
│   (pyautogui)   │    │   (InternVL)    │    │   (Tesseract)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mouse Tool    │    │ Predict Click   │    │ Click OCR      │
│   Keyboard Tool │    │ Tool            │    │ Tool           │
│   Screenshot    │    │                 │    │                │
│   Tool          │    │                 │    │                │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### ComputerInterface

The `ComputerInterface` class provides the foundation for all computer control operations.

```python
from backend.src.tools.computer.computer_interface import ComputerInterface

interface = ComputerInterface(safety_enabled=True)
await interface.initialize()
```

**Key Features:**
- Cross-platform mouse and keyboard control
- Screenshot capture with optional region selection
- Safety measures for destructive operations
- Coordinate scaling and normalization
- Action result tracking

**Safety Features:**
- Destructive action confirmation requirements
- Rate limiting to prevent accidental rapid actions
- Screen region validation
- Error handling with rollback capabilities

### Mouse Control

The mouse control system supports precise cursor positioning and clicking operations.

```python
# Move mouse to absolute coordinates
await interface.move_mouse(x=500, y=300)

# Click at current position
await interface.click_mouse(button="left")

# Double-click
await interface.click_mouse(button="left", double_click=True)

# Right-click
await interface.click_mouse(button="right")
```

**Mouse Actions:**
- `move_mouse(x, y)`: Move cursor to absolute coordinates
- `click_mouse(button, double_click)`: Perform mouse clicks
- `scroll_mouse(direction, amount)`: Scroll operations

### Keyboard Control

Full keyboard simulation including text input, special keys, and modifier combinations.

```python
# Type text
await interface.type_text("Hello, World!")

# Press special keys
await interface.press_key("enter")
await interface.press_key("tab")

# Modifier key combinations
await interface.press_key("ctrl", "c")  # Copy
await interface.press_key("ctrl", "v")  # Paste
await interface.press_key("alt", "tab") # Switch windows
```

**Supported Keys:**
- **Letters**: a-z (case-sensitive)
- **Numbers**: 0-9
- **Special Keys**: enter, esc, tab, space, backspace, del
- **Navigation**: left, right, up, down, home, end, pagedown, pageup
- **Function Keys**: f1-f12
- **Modifiers**: ctrl, alt, shift, win/command

### Screenshot Capture

Screen capture capabilities with region selection and format options.

```python
# Full screen screenshot
screenshot = await interface.take_screenshot()

# Region screenshot
region_screenshot = await interface.take_screenshot(
    region=(100, 100, 800, 600)  # x, y, width, height
)

# Get screenshot as base64
image_data = screenshot.screenshot_data
```

## Tool Implementations

### MouseTool

Provides mouse control capabilities for the AI agent.

```python
from backend.src.tools.computer.mouse_tool import MouseTool

class MouseArgs(BaseModel):
    action: Literal["move", "click", "double_click", "right_click", "scroll"]
    x: Optional[int] = None
    y: Optional[int] = None
    scroll_direction: Optional[Literal["up", "down"]] = None
    scroll_amount: Optional[int] = None

class MouseTool(Tool[MouseArgs]):
    name = "mouse_control"
    description = "Control mouse cursor movements and clicks"

    async def run(self, args: MouseArgs, ctx: Context) -> Dict[str, Any]:
        # Implementation handles mouse actions
        pass
```

**Usage Examples:**
```json
{
  "action": "move",
  "x": 500,
  "y": 300
}
```

```json
{
  "action": "click"
}
```

### KeyboardTool

Simulates keyboard input for text entry and key presses.

```python
from backend.src.tools.computer.keyboard_tool import KeyboardTool

class KeyboardArgs(BaseModel):
    action: Literal["type", "press", "hotkey"]
    text: Optional[str] = None
    key: Optional[str] = None
    modifiers: Optional[List[str]] = None

class KeyboardTool(Tool[KeyboardArgs]):
    name = "keyboard_control"
    description = "Simulate keyboard input and key presses"
```

**Usage Examples:**
```json
{
  "action": "type",
  "text": "Hello, World!"
}
```

```json
{
  "action": "hotkey",
  "modifiers": ["ctrl"],
  "key": "c"
}
```

### ScreenshotTool

Captures screen content for visual analysis.

```python
from backend.src.tools.computer.screenshot_tool import ScreenshotTool

class ScreenshotArgs(BaseModel):
    region: Optional[Tuple[int, int, int, int]] = None
    display_number: Optional[int] = None

class ScreenshotTool(Tool[ScreenshotArgs]):
    name = "screenshot"
    description = "Capture screen content for analysis"
```

### ClickOCRTool

Combines OCR with clicking capabilities to interact with text-based UI elements.

```python
from backend.src.tools.computer.click_ocr_tool import ClickOCRTool

class ClickOCRArgs(BaseModel):
    text: str
    action: Literal["single_click", "double_click", "right_click"] = "single_click"
    occurrence: int = 1

class ClickOCRTool(Tool[ClickOCRArgs]):
    name = "click_ocr"
    description = "Find and click on text visible on screen using OCR"
```

**Features:**
- Text recognition using OCR
- Multiple occurrence handling
- Coordinate calculation for clicking
- Fallback to vision-based detection

### PredictClickTool

Uses vision models to intelligently predict clickable elements.

```python
from backend.src.tools.computer.predict_click_tool import PredictClickTool

class PredictClickArgs(BaseModel):
    description: str
    action: Literal["single_click", "double_click", "right_click"] = "single_click"

class PredictClickTool(Tool[PredictClickArgs]):
    name = "predict_click"
    description = "Use AI vision to predict and click on UI elements"
```

**Advanced Features:**
- Natural language element description
- Vision-based element detection
- Confidence scoring
- Fallback strategies

### ScrollTool

Provides scrolling capabilities for navigating content.

```python
from backend.src.tools.computer.scroll_tool import ScrollTool

class ScrollArgs(BaseModel):
    direction: Literal["up", "down", "left", "right"]
    amount: int = 3
    x: Optional[int] = None
    y: Optional[int] = None

class ScrollTool(Tool[ScrollArgs]):
    name = "scroll"
    description = "Scroll in specified direction"
```

## Vision Integration

The computer control system integrates with vision services for advanced UI interaction:

### InternVL Integration

Uses InternVL vision-language models for understanding screen content:

```python
from backend.src.services.vision.internvl import InternVLModel

model = InternVLModel("OpenGVLab/InternVL-Chat-V1-5")
result = await model.predict_click(
    image=screen_image,
    instruction="Click on the save button"
)
```

**Capabilities:**
- UI element detection and classification
- Coordinate prediction for clicking
- Text region identification
- Visual understanding for interaction prediction

### Coordinate Processing

Advanced coordinate processing for accurate UI interactions:

```python
from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels
)

# Extract coordinates from vision model output
point = extract_first_point(vision_output)
bbox = extract_last_bbox(vision_output)

# Scale normalized coordinates to pixel coordinates
pixel_coords = scale_norm_to_pixels(
    normalized_coords=(0.5, 0.3),
    image_size=(1920, 1080)
)
```

## OCR Integration

Text extraction from screen regions using Tesseract OCR:

```python
# Automatic OCR setup (handled by tools)
ocr_text = await interface.extract_text_from_region(
    region=(100, 100, 300, 200)
)
```

**Features:**
- Region-specific text extraction
- Multiple language support
- Confidence scoring
- Preprocessing for better accuracy

## Configuration

Computer control tools are configured through the main application config:

```yaml
computer_control:
  enabled: true
  safety_enabled: true
  screenshot_format: "PNG"
  ocr_language: "eng"
  max_screenshot_size: 2048576  # 2MB

vision:
  enabled: true
  model_name: "OpenGVLab/InternVL-Chat-V1-5"
  device: "cuda"
  confidence_threshold: 0.7

ocr:
  enabled: true
  languages: ["eng"]
  confidence_threshold: 0.6
```

## Safety and Security

### Safety Measures

- **Confirmation Requirements**: Destructive actions require explicit confirmation
- **Rate Limiting**: Prevents accidental rapid-fire actions
- **Region Validation**: Ensures coordinates are within screen bounds
- **Action Logging**: All actions are logged for audit purposes

### Security Considerations

- **Permission System**: Computer control requires specific user permissions
- **Isolated Execution**: Tools run in restricted execution context
- **Input Validation**: All inputs are validated and sanitized
- **Error Handling**: Graceful failure handling prevents system disruption

## Usage Examples

### Basic Desktop Automation

```python
# Open application and perform actions
await keyboard_tool.run(KeyboardArgs(action="hotkey", modifiers=["win"], key="r"))
await keyboard_tool.run(KeyboardArgs(action="type", text="notepad\n"))

# Wait for application to open
await asyncio.sleep(1)

# Type some text
await keyboard_tool.run(KeyboardArgs(action="type", text="Hello from AI assistant!"))

# Save the file
await keyboard_tool.run(KeyboardArgs(action="hotkey", modifiers=["ctrl"], key="s"))
```

### Intelligent UI Interaction

```python
# Take screenshot
screenshot = await screenshot_tool.run(ScreenshotArgs())

# Use vision to find and click elements
result = await predict_click_tool.run(
    PredictClickArgs(description="Click the submit button")
)
```

### OCR-Based Text Interaction

```python
# Find and click on specific text
result = await click_ocr_tool.run(
    ClickOCRArgs(text="Save Changes", action="single_click")
)
```

## Performance Optimization

### Caching Strategies

- **Screenshot Caching**: Avoid redundant screen captures
- **OCR Result Caching**: Cache text extraction results
- **Vision Model Caching**: Cache vision model inferences

### Optimization Techniques

- **Region-Specific Operations**: Limit operations to relevant screen areas
- **Batch Processing**: Group related operations
- **Async Execution**: Non-blocking computer control operations

## Troubleshooting

### Common Issues

#### Mouse/Keyboard Not Working

```python
# Check if computer interface is initialized
if not interface._initialized:
    await interface.initialize()

# Verify safety settings
print(f"Safety enabled: {interface._safety_enabled}")
```

#### Screenshot Capture Failing

```python
# Check display permissions
# Ensure application has screen capture permissions

# Verify region bounds
screen_size = interface.get_screen_size()
print(f"Screen size: {screen_size}")
```

#### OCR Accuracy Issues

```python
# Check OCR language settings
# Verify image quality and contrast
# Consider preprocessing steps

# Test OCR on known text
test_result = await interface.extract_text_from_region(test_region)
```

#### Vision Model Errors

```python
# Verify model dependencies
try:
    import torch
    import transformers
    print("Dependencies available")
except ImportError as e:
    print(f"Missing dependencies: {e}")

# Check model configuration
print(f"Model loaded: {vision_model.is_loaded()}")
```

## API Reference

### ComputerInterface Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `initialize()` | Initialize computer control interface | - | `None` |
| `move_mouse(x, y)` | Move mouse to coordinates | `x, y: int` | `ComputerActionResult` |
| `click_mouse(button, double_click)` | Perform mouse click | `button: str, double_click: bool` | `ComputerActionResult` |
| `type_text(text)` | Type text on keyboard | `text: str` | `ComputerActionResult` |
| `press_key(*keys)` | Press key combination | `*keys: str` | `ComputerActionResult` |
| `take_screenshot(region)` | Capture screen image | `region: tuple` | `ComputerActionResult` |
| `extract_text_from_region(region)` | Extract text via OCR | `region: tuple` | `str` |

### Tool Classes

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `MouseTool` | Mouse control | Movement, clicking, scrolling |
| `KeyboardTool` | Keyboard input | Text typing, key presses, hotkeys |
| `ScreenshotTool` | Screen capture | Full/region screenshots |
| `ClickOCRTool` | Text-based clicking | OCR text finding and clicking |
| `PredictClickTool` | Vision-based clicking | AI-powered element detection |
| `ScrollTool` | Scrolling operations | Directional scrolling |

This computer control system provides the foundation for comprehensive desktop automation, enabling the Personal Assistant to interact naturally with any application or system through intuitive, AI-powered interfaces.</contents>
</xai:function_call">
