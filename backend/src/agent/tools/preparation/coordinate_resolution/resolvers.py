"""
Coordinate Resolvers.

Pure coordinate resolution logic for OCR and Vision methods.
No side effects, no session access, fully testable.
"""
import difflib
import hashlib
import json
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
        *,
        screenshot_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
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
        
        normalized_candidate_id = (
            candidate_id.strip()
            if isinstance(candidate_id, str) and candidate_id.strip()
            else None
        )
        if not text and not normalized_candidate_id:
            raise ValueError("ocr_text parameter is required for OCR method")

        if normalized_candidate_id:
            candidate = OcrCoordinateResolver._find_candidate_by_id(
                ocr_results,
                normalized_candidate_id,
                screenshot_id=screenshot_id,
            )
            if not candidate:
                raise ValueError(
                    f"Could not find OCR candidate_id '{normalized_candidate_id}' in current frame. "
                    "frame changed, re-ground required."
                )
            bbox = candidate["bbox"]
            x = bbox["x"] + bbox["width"] // 2
            y = bbox["y"] + bbox["height"] // 2
            return x, y
        
        best_score = 0.0
        target = text.lower().strip()
        fuzzy_matches: List[Dict[str, Any]] = []
        scored_matches: List[Dict[str, Any]] = []
        
        for source_index, item in enumerate(ocr_results):
            current = item.get("text", "").lower().strip()
            score = difflib.SequenceMatcher(None, target, current).ratio()
            scored_match = {
                "item": item,
                "score": score,
                "source_index": source_index,
            }
            scored_matches.append(scored_match)
            if score >= threshold:
                fuzzy_matches.append(scored_match)
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
                    screenshot_id=screenshot_id,
                )
            )

        if len(fuzzy_matches) == 1:
            bbox = fuzzy_matches[0]["item"]["bbox"]
            x = bbox["x"] + bbox["width"] // 2
            y = bbox["y"] + bbox["height"] // 2
            return x, y

        raise ValueError(
            OcrCoordinateResolver._build_no_match_error(
                text,
                scored_matches,
                threshold,
                screenshot_id=screenshot_id,
            )
        )

    @staticmethod
    def _build_ambiguous_match_error(
        requested_text: str,
        matches: List[Dict[str, Any]],
        threshold: float,
        *,
        screenshot_id: Optional[str] = None,
    ) -> str:
        """Build an actionable error message for ambiguous fuzzy OCR matches."""
        formatted_matches, candidate_payloads = OcrCoordinateResolver._format_candidate_matches(
            matches,
            screenshot_id=screenshot_id,
            max_listed=8,
        )
        candidates = ", ".join(formatted_matches)
        ambiguity_payload = {
            "retry_tool": "mouse_control",
            "retry_method": "ocr_candidate",
            "candidates": candidate_payloads,
        }
        return (
            f"Multiple OCR instances matched '{requested_text}' above threshold {threshold:.2f}: {candidates}. "
            "Retry with OCR candidate selection only: "
            "(find_coordinates_by='ocr', candidate_id='...'). "
            f"ambiguity_payload_json={json.dumps(ambiguity_payload, separators=(',', ':'))}"
        )

    @staticmethod
    def _build_no_match_error(
        requested_text: str,
        scored_matches: List[Dict[str, Any]],
        threshold: float,
        *,
        screenshot_id: Optional[str] = None,
    ) -> str:
        """Build a no-match error with top candidate suggestions for manual disambiguation."""
        formatted_matches, candidate_payloads = OcrCoordinateResolver._format_candidate_matches(
            scored_matches,
            screenshot_id=screenshot_id,
            max_listed=3,
        )
        best_score = max(
            (
                float(match.get("score", 0.0))
                for match in scored_matches
                if isinstance(match, dict)
            ),
            default=0.0,
        )

        no_match_payload = {
            "retry_tool": "mouse_control",
            "retry_method": "ocr_candidate",
            "threshold": round(float(threshold), 4),
            "best_score": round(best_score, 4),
            "candidates": candidate_payloads,
        }
        candidates = ", ".join(formatted_matches) if formatted_matches else "<none>"
        return (
            f"Could not find text '{requested_text}' above threshold {threshold:.2f} "
            f"(best match: {best_score:.2f}). Top 3 fuzzy matches: {candidates}. "
            "Retry with OCR candidate selection only: "
            "(find_coordinates_by='ocr', candidate_id='...'). "
            f"ambiguity_payload_json={json.dumps(no_match_payload, separators=(',', ':'))}"
        )

    @staticmethod
    def _format_candidate_matches(
        matches: List[Dict[str, Any]],
        *,
        screenshot_id: Optional[str] = None,
        max_listed: int,
    ) -> Tuple[List[str], List[Dict[str, Any]]]:
        """Format candidate summaries and machine-readable payloads."""
        formatted_matches: List[str] = []
        candidate_payloads: List[Dict[str, Any]] = []
        ordered_matches = sorted(
            matches,
            key=lambda match: float(match.get("score", 0.0)),
            reverse=True,
        )
        for fallback_index, match in enumerate(ordered_matches[:max_listed]):
            item = match.get("item") if isinstance(match, dict) else {}
            score = float(match.get("score", 0.0)) if isinstance(match, dict) else 0.0
            text = str(item.get("text", "")).strip() or "<empty>"
            center = OcrCoordinateResolver._extract_bbox_center(item.get("bbox"))
            source_index = (
                match.get("source_index")
                if isinstance(match, dict) and isinstance(match.get("source_index"), int)
                else fallback_index
            )
            candidate_id = OcrCoordinateResolver._build_candidate_id(
                item,
                index=source_index,
                screenshot_id=screenshot_id,
            )
            candidate_payload: Dict[str, Any] = {
                "candidate_id": candidate_id,
                "text": text,
                "score": round(score, 4),
            }
            if center is None:
                candidate_payload["x"] = None
                candidate_payload["y"] = None
                formatted_matches.append(
                    f"{text} [candidate_id={candidate_id}] (unknown coordinates, score={score:.2f})"
                )
            else:
                candidate_payload["x"] = center[0]
                candidate_payload["y"] = center[1]
                formatted_matches.append(
                    f"{text} [candidate_id={candidate_id}] ({center[0]}, {center[1]}, score={score:.2f})"
                )
            candidate_payloads.append(candidate_payload)

        hidden_count = len(ordered_matches) - max_listed
        if hidden_count > 0:
            formatted_matches.append(f"+{hidden_count} more")
        return formatted_matches, candidate_payloads

    @staticmethod
    def _build_candidate_id(
        item: Dict[str, Any],
        *,
        index: int,
        screenshot_id: Optional[str] = None,
    ) -> str:
        bbox = item.get("bbox") if isinstance(item, dict) else None
        if not isinstance(bbox, dict):
            bbox = {}
        text = str(item.get("text", "")).strip().lower() if isinstance(item, dict) else ""
        payload = "|".join(
            [
                str(screenshot_id or ""),
                str(index),
                text,
                str(bbox.get("x", "")),
                str(bbox.get("y", "")),
                str(bbox.get("width", "")),
                str(bbox.get("height", "")),
            ]
        )
        digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]
        return f"ocr_{digest}"

    @staticmethod
    def _find_candidate_by_id(
        ocr_results: List[Dict[str, Any]],
        candidate_id: str,
        *,
        screenshot_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        for index, item in enumerate(ocr_results):
            if not isinstance(item, dict):
                continue
            generated = OcrCoordinateResolver._build_candidate_id(
                item,
                index=index,
                screenshot_id=screenshot_id,
            )
            if generated == candidate_id:
                return item
        return None

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
            raise ValueError("source_description parameter is required for prediction method")
        
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
        *,
        screenshot_id: Optional[str] = None,
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
            candidate_id = tool_call.parameters.get("candidate_id")
            if not ocr_results:
                raise ValueError("OCR results are required for OCR method")
            return self.ocr_resolver.resolve(
                text,
                ocr_results,
                screenshot_id=screenshot_id,
                candidate_id=candidate_id,
            )
        
        elif method == CoordinateFindingMethod.PREDICTION:
            description = tool_call.parameters.get("source_description")
            if not vision_service:
                raise ValueError("Vision service is required for prediction method")
            return await self.vision_resolver.resolve(
                description, screenshot_data, vision_service
            )
        
        else:
            raise ValueError(f"Unknown coordinate finding method: {method}")
