"""
Semantic Memory API Routes.

REST endpoints for semantic memory summarization operations.
"""

import logging
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.src.api.deps import get_container, ContainerDep
from backend.src.core.config import AppConfig
from backend.src.core.config.user_config_manager import get_user_config_manager
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.llm.llm_client import get_llm_client

router = APIRouter(prefix="/api/semantic", tags=["semantic"])
logger = logging.getLogger(__name__)


class SummarizeRequest(BaseModel):
    """Request model for semantic summarization."""
    conversations: List[str]  # List of conversation texts to summarize
    user_id: str = "default_user"


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
        # Get user-specific config merged with global config
        global_config = container.config
        user_config_manager = get_user_config_manager()
        user_config = user_config_manager.load_user_config(request.user_id)
        
        # Build merged config: global + user overrides
        if user_config:
            merged_config_dict = {**global_config.model_dump(), **user_config}
            merged_config = AppConfig(**merged_config_dict)
            # Load API key for the selected provider
            merged_config = load_api_key_for_provider(merged_config)
        else:
            # No user-specific config, use global config
            merged_config = global_config
        
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
        from backend.src.core.types import LLMMessage
        
        messages: List[LLMMessage] = [
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        response_text = await llm_client.get_completion(model, messages)
        
        # Parse response
        summary = ""
        facts = []
        
        lines = response_text.split("\n")
        in_facts_section = False
        
        for line in lines:
            line = line.strip()
            if line.startswith("SUMMARY:"):
                summary = line.replace("SUMMARY:", "").strip()
            elif line.startswith("FACTS:"):
                in_facts_section = True
            elif in_facts_section and line.startswith("-"):
                fact = line[1:].strip()
                if fact:
                    facts.append(fact)
        
        # If parsing failed, use the whole response as summary
        if not summary:
            summary = response_text[:500]  # First 500 chars
        if not facts:
            # Try to extract facts from the response
            for line in lines:
                if line.strip().startswith("-"):
                    fact = line.strip()[1:].strip()
                    if fact:
                        facts.append(fact)
        
        logger.info(f"Summarized {len(request.conversations)} conversations into {len(facts)} facts for user {request.user_id}")
        
        return SummarizeResponse(
            summary=summary,
            facts=facts,
            success=True
        )
        
    except Exception as e:
        logger.error(f"Failed to summarize conversations: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Summarization failed: {str(e)}"
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
        logger.error(f"Semantic health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }
