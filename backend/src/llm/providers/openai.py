import logging

from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(OnlineLLMProvider):
    """Provider for OpenAI models."""

    provider_label = "OpenAI"
    model_prefix = None
