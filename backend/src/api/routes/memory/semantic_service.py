"""Semantic summarization service logic extracted from route handlers."""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, List, Optional, Tuple

from fastapi import HTTPException

from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)

FALLBACK_SUMMARY_LENGTH = 500
FALLBACK_TITLE = "New chat"
TITLE_MAX_CHARS = 48
TITLE_MAX_WORDS = 6


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
            merged_config = self._resolve_effective_config(
                user_id=user_id,
                session_manager=session_manager,
                container=container,
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

    async def generate_title(
        self,
        *,
        user_message: str,
        assistant_message: str,
        user_id: str,
        container: Any,
        session_manager: Any,
        model_id_override: Optional[str] = None,
        model_provider_override: Optional[str] = None,
    ) -> str:
        """Generate a concise conversation title using the active/overridden model."""
        try:
            merged_config = self._resolve_effective_config(
                user_id=user_id,
                session_manager=session_manager,
                container=container,
            )

            if model_provider_override:
                merged_config = merged_config.model_copy(
                    update={"model_provider": model_provider_override}
                )
            if model_id_override:
                merged_config = merged_config.model_copy(
                    update={"selected_model_id": model_id_override}
                )

            if merged_config.model_mode != "local" and not merged_config.api_key:
                merged_config = self._load_api_key_for_provider(merged_config)

            llm_client = self._get_llm_client(merged_config)
            if not llm_client:
                raise HTTPException(status_code=503, detail="LLM service not available")

            prompt = self._build_title_prompt(user_message, assistant_message)
            messages: List[LLMMessage] = [{"role": "user", "content": prompt}]
            response_text = await llm_client.get_completion(
                merged_config.selected_model_id,
                messages,
            )
            parsed_title = self._parse_title_response(response_text)
            if parsed_title:
                return parsed_title
            return FALLBACK_TITLE
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to generate conversation title: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Title generation failed: An internal error occurred",
            ) from e

    def _resolve_effective_config(self, *, user_id: str, session_manager: Any, container: Any):
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
            return merged_config

        merged_config = container.config
        logger.debug(
            "Semantic summarize using global config (no active session) "
            "(user_id=%s, provider=%s, model=%s)",
            user_id,
            merged_config.model_provider,
            merged_config.selected_model_id,
        )
        return merged_config

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

    @staticmethod
    def _build_title_prompt(user_message: str, assistant_message: str) -> str:
        safe_user = (user_message or "").strip()[:4000]
        safe_assistant = (assistant_message or "").strip()[:4000]
        return f"""Generate a concise chat title based on this first exchange.

Requirements:
- 2 to 6 words
- plain text only
- no quotes
- no punctuation at the end
- reflect the core intent/topic

User message:
{safe_user}

Assistant response:
{safe_assistant}

Return only the title text."""

    @staticmethod
    def _parse_title_response(response_text: str) -> str:
        if not isinstance(response_text, str):
            return ""
        text = response_text.strip()
        if not text:
            return ""

        first_line = next(
            (line.strip() for line in text.splitlines() if line.strip()),
            "",
        )
        if not first_line:
            return ""

        first_line = re.sub(r"^(title\s*:\s*)", "", first_line, flags=re.IGNORECASE)
        first_line = first_line.strip().strip("`").strip().strip("\"'")
        first_line = re.sub(r"\s+", " ", first_line).strip()
        if not first_line:
            return ""

        words = first_line.split()
        if words:
            first_line = " ".join(words[:TITLE_MAX_WORDS]).strip()

        if len(first_line) > TITLE_MAX_CHARS:
            first_line = first_line[:TITLE_MAX_CHARS].rstrip()
        return first_line
