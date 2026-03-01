import logging
from typing import Any, Dict, Optional

from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.models.models_config import resolve_model_preset
from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(OnlineLLMProvider):
    """Provider for OpenRouter."""

    provider_label = "OpenRouter"
    model_prefix = "openrouter"
    stream_includes_thinking = True

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        # Default base_url for OpenRouter if not provided
        if base_url is None:
            base_url = "https://openrouter.ai/api/v1"
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        preset = resolve_model_preset(model)
        thinking_override = (
            preset.get("supports_thinking")
            if isinstance(preset, dict) and isinstance(preset.get("supports_thinking"), bool)
            else None
        )
        provider_name = "openrouter"
        enable_thinking = (
            thinking_override is True
            or (
                thinking_override is None
                and provider_name in ONLINE_THINKING_MODELS
                and model in ONLINE_THINKING_MODELS[provider_name]
            )
        )

        if enable_thinking:
            # Ask OpenRouter to include reasoning text in response payloads.
            reasoning = params.get("reasoning")
            if isinstance(reasoning, dict):
                reasoning.setdefault("exclude", False)
            elif reasoning is None:
                params["reasoning"] = {"exclude": False}
        elif thinking_override is False:
            params.pop("reasoning", None)

        _ = runtime_model_id
        return params
