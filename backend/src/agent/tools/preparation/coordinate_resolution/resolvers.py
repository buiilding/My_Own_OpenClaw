"""
Coordinate Resolvers.

Pure coordinate resolution logic for OCR and Vision methods.
No side effects, no session access, fully testable.
"""
import difflib
import logging
import time
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING

from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)


class OcrCoordinateResolver:
    """
    Resolves coordinates using OCR text matching.
    
    Pure function: no side effects, deterministic output.
    Input: text → Output: coordinates
    """

    @staticmethod
    def resolve(
        text: str,
        ocr_results: List[Dict[str, Any]],
        threshold: float = 0.8,
    ) -> Tuple[int, int]:
        """
        Resolve coordinates by finding matching text in OCR results.
        
        Args:
            text: Text to search for
            ocr_results: List of OCR results with text and bbox
            threshold: Similarity threshold (0-1)
            
        Returns:
            Tuple of (x, y) center coordinates
            
        Raises:
            ValueError: If text not found or multiple fuzzy matches exceed threshold
        """
        ocr_match_start = time.perf_counter()
        if not ocr_results:
            raise ValueError("OCR results are empty")
        
        if not text:
            raise ValueError("ocr_text parameter is required for OCR method")
        
        best_score = 0.0
        target = text.lower().strip()
        fuzzy_matches: List[Dict[str, Any]] = []
        
        for item in ocr_results:
            current = item.get("text", "").lower().strip()
            score = difflib.SequenceMatcher(None, target, current).ratio()
            if score >= threshold:
                fuzzy_matches.append({"item": item, "score": score})
            if score > best_score:
                best_score = score
        
        ocr_match_time = time.perf_counter() - ocr_match_start
        logger.info(
            "[Timing] OCR text matching took %.3fs (searched %s items, fuzzy_matches=%s, best_score=%.2f)",
            ocr_match_time,
            len(ocr_results),
            len(fuzzy_matches),
            best_score,
        )

        if len(fuzzy_matches) > 1:
            raise ValueError(
                OcrCoordinateResolver._build_ambiguous_match_error(
                    text,
                    fuzzy_matches,
                    threshold,
                )
            )

        if len(fuzzy_matches) == 1:
            bbox = fuzzy_matches[0]["item"]["bbox"]
            x = bbox["x"] + bbox["width"] // 2
            y = bbox["y"] + bbox["height"] // 2
            return x, y

        raise ValueError(
            f"Could not find text '{text}' on screen (best match: {best_score:.2f})"
        )

    @staticmethod
    def _build_ambiguous_match_error(
        requested_text: str,
        matches: List[Dict[str, Any]],
        threshold: float,
    ) -> str:
        """Build an actionable error message for ambiguous fuzzy OCR matches."""
        max_listed = 8
        formatted_matches: List[str] = []
        ordered_matches = sorted(
            matches,
            key=lambda match: float(match.get("score", 0.0)),
            reverse=True,
        )
        for match in ordered_matches[:max_listed]:
            item = match.get("item") if isinstance(match, dict) else {}
            score = float(match.get("score", 0.0)) if isinstance(match, dict) else 0.0
            text = str(item.get("text", "")).strip() or "<empty>"
            center = OcrCoordinateResolver._extract_bbox_center(item.get("bbox"))
            if center is None:
                formatted_matches.append(f"{text} (unknown coordinates, score={score:.2f})")
            else:
                formatted_matches.append(
                    f"{text} ({center[0]}, {center[1]}, score={score:.2f})"
                )

        hidden_count = len(ordered_matches) - max_listed
        if hidden_count > 0:
            formatted_matches.append(f"+{hidden_count} more")

        candidates = ", ".join(formatted_matches)
        return (
            f"Multiple OCR instances matched '{requested_text}' above threshold {threshold:.2f}: {candidates}. "
            "Choose which one by calling click again with manual coordinates "
            "(find_coordinates_by='manual', x=..., y=...)."
        )

    @staticmethod
    def _extract_bbox_center(bbox: Any) -> Optional[Tuple[int, int]]:
        """Extract bbox center as integer screen coordinates."""
        if not isinstance(bbox, dict):
            return None
        try:
            x = int(bbox["x"]) + int(bbox["width"]) // 2
            y = int(bbox["y"]) + int(bbox["height"]) // 2
        except (KeyError, TypeError, ValueError):
            return None
        return x, y


class VisionCoordinateResolver:
    """
    Resolves coordinates using Vision model.
    
    Pure function: no side effects, deterministic output.
    Input: text (description) → Output: coordinates
    """

    @staticmethod
    async def resolve(
        description: str,
        screenshot_data: str,
        vision_service: "IVisionService",
    ) -> Tuple[int, int]:
        """
        Resolve coordinates using Vision model prediction.
        
        Args:
            description: Visual description of element to find
            screenshot_data: Base64-encoded screenshot
            vision_service: Initialized vision service
            
        Returns:
            Tuple of (x, y) coordinates
            
        Raises:
            ValueError: If description missing, service unavailable, or element not found
        """
        vision_start = time.perf_counter()
        if not description:
            raise ValueError("description parameter is required for prediction method")
        
        if not vision_service or not vision_service.is_initialized:
            raise ValueError("Vision service is not available or initialized")
        
        model = vision_service.model
        if not model:
            raise ValueError("Vision model instance is None")
        
        # Run prediction
        coordinates = await model.predict_click_coordinates(screenshot_data, description)
        vision_time = time.perf_counter() - vision_start
        logger.info(f"[Timing] Vision model prediction took {vision_time:.3f}s (description='{description[:50]}...')")
        
        if not coordinates:
            raise ValueError(f"Vision model could not identify '{description}'")
        
        return coordinates


class CoordinateResolver:
    """
    Routes coordinate resolution to OCR or Vision methods.
    
    Pure function: no side effects, deterministic output.
    """

    def __init__(
        self,
        ocr_resolver: OcrCoordinateResolver,
        vision_resolver: VisionCoordinateResolver,
    ):
        """
        Initialize the coordinate resolver.
        
        Args:
            ocr_resolver: OCR coordinate resolver
            vision_resolver: Vision coordinate resolver
        """
        self.ocr_resolver = ocr_resolver
        self.vision_resolver = vision_resolver

    async def resolve(
        self,
        tool_call: ParsedToolCall,
        screenshot_data: str,
        ocr_results: Optional[List[Dict[str, Any]]],
        vision_service: Optional["IVisionService"],
    ) -> Tuple[int, int]:
        """
        Resolve coordinates using OCR or Vision based on tool call parameters.
        
        Args:
            tool_call: Parsed tool call with coordinate finding method
            screenshot_data: Base64-encoded screenshot
            ocr_results: Optional OCR results (for OCR method)
            vision_service: Optional vision service (for Vision method)
            
        Returns:
            Tuple of (x, y) coordinates
            
        Raises:
            ValueError: If method unknown, parameters missing, or resolution fails
        """
        method = tool_call.parameters.get("find_coordinates_by")
        
        if method == CoordinateFindingMethod.OCR:
            text = tool_call.parameters.get("ocr_text")
            if not ocr_results:
                raise ValueError("OCR results are required for OCR method")
            return self.ocr_resolver.resolve(text, ocr_results)
        
        elif method == CoordinateFindingMethod.PREDICTION:
            description = tool_call.parameters.get("description")
            if not vision_service:
                raise ValueError("Vision service is required for prediction method")
            return await self.vision_resolver.resolve(
                description, screenshot_data, vision_service
            )
        
        else:
            raise ValueError(f"Unknown coordinate finding method: {method}")
