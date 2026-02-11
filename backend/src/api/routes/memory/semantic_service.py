"""Semantic summarization service logic extracted from route handlers."""

from __future__ import annotations

import logging
from typing import Any, Callable, List, Tuple

from fastapi import HTTPException

from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)

FALLBACK_SUMMARY_LENGTH = 500


class SemanticSummarizationService:
    """Runs semantic summarization using session-aware model config."""

    def __init__(
        self,
        *,
        get_llm_client_fn: Callable[[Any], Any],
        load_api_key_fn: Callable[[Any], Any],
        parse_response_fn: Callable[[str], Tuple[str, List[str]]],
        fallback_facts_fn: Callable[[str], List[str]],
    ) -> None:
        self._get_llm_client = get_llm_client_fn
        self._load_api_key_for_provider = load_api_key_fn
        self._parse_response = parse_response_fn
        self._extract_fallback_facts = fallback_facts_fn

    async def summarize(
        self,
        *,
        conversations: List[str],
        user_id: str,
        container: Any,
        session_manager: Any,
    ) -> tuple[str, List[str]]:
        """Summarize conversations and extract semantic facts."""
        try:
            session = session_manager.get_session(user_id)
            if session:
                merged_config = session.cfg
                logger.debug(
                    "Semantic summarize using session config "
                    "(user_id=%s, provider=%s, model=%s)",
                    user_id,
                    merged_config.model_provider,
                    merged_config.selected_model_id,
                )
            else:
                merged_config = container.config
                logger.debug(
                    "Semantic summarize using global config (no active session) "
                    "(user_id=%s, provider=%s, model=%s)",
                    user_id,
                    merged_config.model_provider,
                    merged_config.selected_model_id,
                )

            if merged_config.model_mode != "local" and not merged_config.api_key:
                merged_config = self._load_api_key_for_provider(merged_config)

            llm_client = self._get_llm_client(merged_config)
            if not llm_client:
                raise HTTPException(status_code=503, detail="LLM service not available")

            prompt = self._build_prompt(conversations)
            messages: List[LLMMessage] = [{"role": "user", "content": prompt}]
            response_text = await llm_client.get_completion(
                merged_config.selected_model_id,
                messages,
            )

            summary, facts = self._parse_response(response_text)
            if not summary:
                logger.warning("Failed to extract summary from LLM response, using fallback")
                summary = response_text[:FALLBACK_SUMMARY_LENGTH].strip() or "Summary extraction failed"

            if not facts:
                logger.warning("Failed to extract facts from LLM response")
                facts = self._extract_fallback_facts(response_text)

            return summary, facts
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to summarize conversations: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Summarization failed: An internal error occurred",
            ) from e

    @staticmethod
    def _build_prompt(conversations: List[str]) -> str:
        conversations_text = "\n\n---\n\n".join(conversations)
        return f"""You are analyzing conversation history to extract important semantic information that should be remembered long-term.

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
