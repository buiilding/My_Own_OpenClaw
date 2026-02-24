import logging

from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class MistralProvider(OnlineLLMProvider):
    """Provider for Mistral AI models."""

    provider_label = "Mistral"
    model_prefix = "mistral"
