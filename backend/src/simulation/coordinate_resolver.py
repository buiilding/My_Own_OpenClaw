import logging
import difflib
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)

def resolve_ocr_coordinates(ocr_results: List[Dict[str, Any]], target_text: str, threshold: float = 0.8) -> Tuple[int, int]:
    """
    Resolve coordinates by searching for text using OCR results.
    
    Args:
        ocr_results: List of OCR results (from OCRPlugin)
        target_text: Text to search for
        threshold: Similarity threshold (0-1)
        
    Returns:
        Tuple[int, int]: Center coordinates (x, y)
        
    Raises:
        ValueError: If text not found
    """
    if not ocr_results:
        raise ValueError("OCR results are empty")
        
    best_match = None
    best_ratio = 0.0
    
    target_lower = target_text.lower()
    
    for item in ocr_results:
        text = item.get("text", "")
        if not text:
            continue
            
        ratio = difflib.SequenceMatcher(None, target_lower, text.lower()).ratio()
        
        # Also check for substring match which is often useful for UI elements
        if target_lower in text.lower():
            ratio = max(ratio, 0.9)
            
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = item
            
    if best_match and best_ratio >= threshold:
        bbox = best_match.get("bbox", {})
        x = bbox.get("x", 0)
        y = bbox.get("y", 0)
        width = bbox.get("width", 0)
        height = bbox.get("height", 0)
        
        center_x = int(x + width / 2)
        center_y = int(y + height / 2)
        
        logger.info(f"Found text '{target_text}' at ({center_x}, {center_y}) with confidence {best_ratio:.2f}")
        return (center_x, center_y)
        
    raise ValueError(f"Text '{target_text}' not found in OCR results (best match: {best_ratio:.2f})")

async def resolve_vision_coordinates(vision_service, screenshot_b64: str, description: str) -> Tuple[int, int]:
    """
    Resolve coordinates using Vision model.
    
    Args:
        vision_service: Initialized VisionService instance
        screenshot_b64: Base64 encoded screenshot
        description: Description of element to find
        
    Returns:
        Tuple[int, int]: Coordinates (x, y)
        
    Raises:
        ValueError: If element not found
    """
    coordinates = await vision_service.predict_click_coordinates(screenshot_b64, description)
    
    if coordinates:
        logger.info(f"Vision model found '{description}' at {coordinates}")
        return coordinates
        
    raise ValueError(f"Vision model could not find element matching '{description}'")
