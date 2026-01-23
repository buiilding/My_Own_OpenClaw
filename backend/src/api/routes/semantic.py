"""
Semantic Memory API Routes.

REST endpoints for semantic memory summarization operations.
"""

import logging
import re
from typing import Dict, Any, List, Tuple

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from backend.src.api.deps import ContainerDep
from backend.src.core.config import AppConfig
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.types import LLMMessage
from backend.src.core.validation import ValidationError, validate_user_id
from backend.src.llm.client import get_llm_client

router = APIRouter(prefix="/api/semantic", tags=["semantic"])
logger = logging.getLogger(__name__)

# Constants
FALLBACK_SUMMARY_LENGTH = 500  # Characters to use for fallback summary if parsing fails

# INEFFICIENCY #4: AppConfig re-instantiation on every request
# Pydantic validation adds 10-50ms overhead per request for high-throughput endpoints.
# Proper fix requires implementing LRU cache keyed by (user_id, user_config_hash)
# with cache invalidation on user config changes. This requires refactoring to pass
# user_config_manager or implementing a config cache service.
# For now, we accept this overhead as user configs may change frequently and
# the semantic endpoint is not expected to be high-throughput.


class SummarizeRequest(BaseModel):
    """Request model for semantic summarization."""
    # FIX: Add constraints to prevent DoS
    conversations: List[str] = Field(
        ..., 
        min_items=1, 
        max_items=100, 
        description="List of conversation texts to summarize (max 100 items)"
    )  # Each conversation string validated below
    user_id: str = Field(..., min_length=1, description="User ID (required, cannot be default_user)")
    
    @field_validator('conversations')
    @classmethod
    def validate_conversation_lengths(cls, v: List[str]) -> List[str]:
        """Validate each conversation string length."""
        max_length = 32768  # 32KB per conversation
        for i, conv in enumerate(v):
            if len(conv) > max_length:
                raise ValueError(f"Conversation {i} exceeds maximum length of {max_length} characters")
        return v
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id_field(cls, v: str) -> str:
        """
        Validate user_id using shared utility for consistency.
        
        Security: Prevents security bypass and invalid state propagation.
        """
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e


class SummarizeResponse(BaseModel):
    """Response model for semantic summarization."""
    summary: str
    facts: List[str]  # Extracted facts/preferences
    success: bool


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversations(
    request: SummarizeRequest,
    container: ContainerDep
) -> SummarizeResponse:
    """
    Summarize conversations and extract semantic information.
    
    This endpoint processes episodic memories and extracts:
    - Key facts about the user
    - User preferences
    - Important context that should persist long-term
    
    Args:
        request: Summarization request with conversations and user_id
        container: Application container with access to LLM client
        
    Returns:
        Summarization response with extracted facts and summary
        
    Raises:
        HTTPException: If summarization fails
    """
    try:
        # Use global config only (no user-specific config storage)
        merged_config = container.config
        
        # Create LLM client with user's merged config
        llm_client = get_llm_client(merged_config)
        if not llm_client:
            raise HTTPException(
                status_code=503,
                detail="LLM service not available"
            )
        
        # Get model from merged config (user's selected model)
        model = merged_config.selected_model_id
        
        # Build prompt for semantic extraction
        conversations_text = "\n\n---\n\n".join(request.conversations)
        
        prompt = f"""You are analyzing conversation history to extract important semantic information that should be remembered long-term.

Extract:
1. **User Preferences**: Any stated preferences (e.g., "I prefer dark mode", "I like Python over JavaScript")
2. **Key Facts**: Important facts about the user (e.g., "User works as a software engineer", "User's name is John")
3. **Important Context**: Context that would be useful in future conversations (e.g., "User is learning machine learning", "User uses Linux")

Conversation History:
{conversations_text}

Provide a structured summary with:
- A brief overall summary (1-2 sentences)
- A list of specific facts and preferences (one per line, as bullet points)

Format your response as:
SUMMARY: [brief summary]

FACTS:
- [fact 1]
- [fact 2]
- [fact 3]
"""
        
        # Call LLM for summarization
        messages: List[LLMMessage] = [
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        response_text = await llm_client.get_completion(model, messages)
        
        # Parse response using regex for robust extraction
        summary, facts = _parse_summarization_response(response_text)
        
        # Validate parsed results
        if not summary:
            logger.warning(f"Failed to extract summary from LLM response, using fallback")
            summary = response_text[:FALLBACK_SUMMARY_LENGTH].strip()
            if not summary:
                summary = "Summary extraction failed"
        
        if not facts:
            logger.warning(f"Failed to extract facts from LLM response")
            # Try fallback extraction: look for any bullet points in the response
            facts = _extract_fallback_facts(response_text)
        
        logger.info(f"Summarized {len(request.conversations)} conversations into {len(facts)} facts for user {request.user_id}")
        
        return SummarizeResponse(
            summary=summary,
            facts=facts,
            success=True
        )
        
    except HTTPException:
        # Re-raise HTTPExceptions to preserve status codes (e.g., 503 Service Unavailable)
        raise
    except Exception as e:
        logger.error(f"Failed to summarize conversations: {e}", exc_info=True)
        # Sanitize error message to prevent information leakage
        # Full details are logged server-side above
        raise HTTPException(
            status_code=500,
            detail="Summarization failed: An internal error occurred"
        )


@router.get("/health")
async def health_check(
    container: ContainerDep
) -> Dict[str, Any]:
    """
    Health check for the semantic summarization service.
    
    Returns:
        Health status information
    """
    try:
        llm_client = container.llm_client
        if not llm_client:
            return {
                "status": "unhealthy",
                "message": "LLM client not available"
            }
        
        return {
            "status": "healthy",
            "message": "Semantic summarization service ready"
        }
        
    except Exception as e:
        logger.error(f"Semantic health check failed: {e}", exc_info=True)
        # Sanitize error to prevent information leakage
        return {
            "status": "unhealthy",
            "message": "Health check failed"
        }


def _parse_summarization_response(response_text: str) -> Tuple[str, List[str]]:
    """
    Parse LLM summarization response to extract summary and facts.
    
    Uses regex patterns to robustly extract structured content from LLM responses.
    Handles variations in formatting (whitespace, case, punctuation).
    
    Args:
        response_text: Raw LLM response text
        
    Returns:
        Tuple of (summary, facts_list)
    """
    summary = ""
    facts = []
    
    # CRITICAL FIX #2: More permissive regex for SUMMARY extraction
    # Handles common LLM variations: "SUMMARY:", "**Summary**", "## Summary", "Summary"
    # Pattern: Optional markdown formatting, optional colon, capture rest of line/paragraph
    summary_pattern = re.compile(
        r'(?:\*\*|##\s*)?SUMMARY:?\s*(.+?)(?:\n\n|\nFACTS:|$)',
        re.IGNORECASE | re.DOTALL
    )
    summary_match = summary_pattern.search(response_text)
    if summary_match:
        summary = summary_match.group(1).strip()
    
    # Pattern for FACTS: section (case-insensitive)
    # Matches "FACTS:" followed by bullet points (lines starting with "-" or "*")
    facts_section_pattern = re.compile(
        r'FACTS:\s*\n((?:[-*]\s*.+?(?:\n|$))+)',
        re.IGNORECASE | re.MULTILINE
    )
    facts_match = facts_section_pattern.search(response_text)
    
    if facts_match:
        # Extract individual facts from the matched section
        facts_text = facts_match.group(1)
        # Match lines starting with "-" or "*" followed by fact text
        fact_line_pattern = re.compile(r'[-*]\s*(.+?)(?:\n|$)', re.MULTILINE)
        for match in fact_line_pattern.finditer(facts_text):
            fact = match.group(1).strip()
            if fact:
                facts.append(fact)
    else:
        # Fallback: look for any bullet points after "FACTS:" marker
        facts_marker_pattern = re.compile(r'FACTS:\s*\n', re.IGNORECASE)
        marker_match = facts_marker_pattern.search(response_text)
        if marker_match:
            # Extract everything after FACTS: marker
            after_marker = response_text[marker_match.end():]
            fact_line_pattern = re.compile(r'[-*]\s*(.+?)(?:\n|$)', re.MULTILINE)
            for match in fact_line_pattern.finditer(after_marker):
                fact = match.group(1).strip()
                if fact:
                    facts.append(fact)
    
    return summary, facts


def _extract_fallback_facts(response_text: str) -> List[str]:
    """
    Fallback fact extraction: find any bullet points in the response.
    
    Used when structured parsing fails. Less reliable but better than nothing.
    
    Args:
        response_text: Raw LLM response text
        
    Returns:
        List of extracted facts
    """
    facts = []
    fact_line_pattern = re.compile(r'[-*]\s*(.+?)(?:\n|$)', re.MULTILINE)
    for match in fact_line_pattern.finditer(response_text):
        fact = match.group(1).strip()
        if fact and len(fact) > 3:  # Filter out very short matches (likely false positives)
            facts.append(fact)
    return facts
