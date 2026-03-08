"""Static online/local model catalogs and variant helpers."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _variant(
    *,
    runtime_model_id: str,
    display_name: str,
    supports_thinking: bool,
    supports_thinking_text_stream: Optional[bool] = None,
) -> Dict[str, Any]:
    mode = "thinking" if supports_thinking else "nonthinking"
    model_id = f"{runtime_model_id}@@{_slugify(display_name)}-{mode}"
    entry: Dict[str, Any] = {
        "id": model_id,
        "runtime_model_id": runtime_model_id,
        "display_name": display_name,
        "supports_thinking": supports_thinking,
    }
    if supports_thinking_text_stream is not None:
        entry["supports_thinking_text_stream"] = supports_thinking_text_stream
    return entry


OPENAI_PRESETS: List[Dict[str, Any]] = [
    _variant(runtime_model_id="gpt-5", display_name="GPT-5", supports_thinking=False),
    _variant(runtime_model_id="gpt-5.1", display_name="GPT-5.1", supports_thinking=False),
    _variant(runtime_model_id="gpt-5-mini", display_name="GPT-5 Mini", supports_thinking=False),
    _variant(runtime_model_id="gpt-4.1", display_name="GPT-4.1", supports_thinking=False),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Low Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Extra High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Extra High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Spark Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Spark", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Spark High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.3-codex", display_name="GPT-5.3 Codex Spark Extra High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 Low Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 Extra High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2", display_name="GPT-5.2 Extra High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex Low Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex Extra High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.2-codex", display_name="GPT-5.2 Codex Extra High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max Low Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max Medium Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max Extra High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-max", display_name="GPT-5.1 Codex Max Extra High Fast", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1", display_name="GPT-5.1 High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-mini", display_name="GPT-5.1 Codex Mini Low", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-mini", display_name="GPT-5.1 Codex Mini", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5.1-codex-mini", display_name="GPT-5.1 Codex Mini High", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gpt-5-mini", display_name="GPT-5 Mini", supports_thinking=True, supports_thinking_text_stream=True),
]


ANTHROPIC_PRESETS: List[Dict[str, Any]] = [
    _variant(runtime_model_id="claude-sonnet-4-5-20250929", display_name="Claude Sonnet 4.5", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-5-20250929", display_name="Claude Sonnet 4.5", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Claude Opus 4.6", supports_thinking=False),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Claude Opus 4.6", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-haiku-4-5-20251001", display_name="Claude Haiku 4.5", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-6", display_name="Sonnet 4.6", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-6", display_name="Sonnet 4.6", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6", supports_thinking=False),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6 Max", supports_thinking=False),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6 Max", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6 Fast Max Only", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-6", display_name="Opus 4.6 Max Fast Max Only", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-opus-4-5", display_name="Opus 4.5", supports_thinking=False),
    _variant(runtime_model_id="claude-opus-4-5", display_name="Opus 4.5", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-haiku-4-5", display_name="Haiku 4.5", supports_thinking=False),
    _variant(runtime_model_id="claude-haiku-4-5", display_name="Haiku 4.5", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-sonnet-4-5", display_name="Sonnet 4.5", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-5", display_name="Sonnet 4.5", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-sonnet-4-20250514", display_name="Sonnet 4", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-20250514", display_name="Sonnet 4", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="claude-sonnet-4-20250514", display_name="Sonnet 4 1M Max Only", supports_thinking=False),
    _variant(runtime_model_id="claude-sonnet-4-20250514", display_name="Sonnet 4 1M Max Only", supports_thinking=True, supports_thinking_text_stream=True),
]


GEMINI_PRESETS: List[Dict[str, Any]] = [
    _variant(runtime_model_id="gemini-2.5-flash", display_name="Gemini 2.5 Flash", supports_thinking=False),
    _variant(runtime_model_id="gemini-2.5-pro", display_name="Gemini 2.5 Pro", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gemini-3-pro-preview", display_name="Gemini 3 Pro", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gemini-3-flash-preview", display_name="Gemini 3 Flash", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gemini-3.1-pro-preview", display_name="Gemini 3.1 Pro", supports_thinking=False),
    _variant(runtime_model_id="gemini-3.1-pro-preview", display_name="Gemini 3.1 Pro", supports_thinking=True, supports_thinking_text_stream=True),
    _variant(runtime_model_id="gemini-2.5-flash", display_name="Gemini 2.5 Flash", supports_thinking=True, supports_thinking_text_stream=True),
]


OPENROUTER_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "openrouter/auto",
        "runtime_model_id": "openrouter/auto",
        "display_name": "OpenRouter Auto",
        "supports_thinking": False,
    },
    {
        "id": "qwen/qwen3-vl-235b-a22b-thinking",
        "runtime_model_id": "qwen/qwen3-vl-235b-a22b-thinking",
        "display_name": "Qwen3 VL 235B A22B Thinking",
        "supports_thinking": True,
        "supports_thinking_text_stream": True,
    },
]

MISTRAL_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "mistral-large-latest",
        "runtime_model_id": "mistral-large-latest",
        "display_name": "Mistral Large Latest",
        "supports_thinking": False,
    },
    {
        "id": "mistral-small-latest",
        "runtime_model_id": "mistral-small-latest",
        "display_name": "Mistral Small Latest",
        "supports_thinking": False,
    },
]

KIMI_CODING_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "k2p5",
        "runtime_model_id": "k2p5",
        "display_name": "K2P5",
        "supports_thinking": False,
    },
]


ONLINE_MODELS: Dict[str, List[Dict[str, Any]]] = {
    "openai": OPENAI_PRESETS,
    "anthropic": ANTHROPIC_PRESETS,
    "gemini": GEMINI_PRESETS,
    "mistral": MISTRAL_PRESETS,
    "openrouter": OPENROUTER_PRESETS,
    "kimi-coding": KIMI_CODING_PRESETS,
}

ONLINE_THINKING_MODELS: Dict[str, List[str]] = {
    provider: [
        str(model.get("id"))
        for model in models
        if model.get("supports_thinking") is True
    ]
    for provider, models in ONLINE_MODELS.items()
}

# Models that emit reasoning token usage but do not reliably stream
# textual thought deltas through LiteLLM streaming payloads.
THINKING_TEXT_STREAM_UNSUPPORTED_MODELS: Dict[str, List[str]] = {
}


_MODEL_PRESET_BY_ID: Dict[str, Dict[str, Any]] = {
    str(model.get("id")): dict(model)
    for models in ONLINE_MODELS.values()
    for model in models
    if model.get("id")
}


def resolve_model_preset(model_id: str) -> Optional[Dict[str, Any]]:
    """Return static model preset metadata by selected model id."""
    if not isinstance(model_id, str):
        return None
    model_id = model_id.strip()
    if not model_id:
        return None
    preset = _MODEL_PRESET_BY_ID.get(model_id)
    if not preset and "/" in model_id:
        _, scoped_model_id = model_id.split("/", 1)
        preset = _MODEL_PRESET_BY_ID.get(scoped_model_id)
    return dict(preset) if preset else None


def resolve_provider_thinking_preference(
    *,
    model_id: str,
    provider_name: str,
) -> Optional[bool]:
    """Resolve thinking preference for a model/provider pair.

    Returns:
        - True: thinking should be enabled
        - False: thinking should be disabled
        - None: no provider-level preference (leave caller defaults unchanged)
    """
    if not isinstance(model_id, str) or not isinstance(provider_name, str):
        return None
    normalized_model_id = model_id.strip()
    normalized_provider = provider_name.strip().lower()
    if not normalized_model_id or not normalized_provider:
        return None

    preset = resolve_model_preset(normalized_model_id)
    supports_thinking = preset.get("supports_thinking") if isinstance(preset, dict) else None
    if isinstance(supports_thinking, bool):
        return supports_thinking

    thinking_models = ONLINE_THINKING_MODELS.get(normalized_provider, [])
    if normalized_model_id in thinking_models:
        return True
    return None


def resolve_runtime_model_id(model_id: str) -> str:
    """Map selected preset id to runtime LiteLLM model id."""
    if not isinstance(model_id, str):
        return model_id
    normalized_model_id = model_id.strip()
    if not normalized_model_id:
        return model_id

    if "/" in normalized_model_id:
        provider_prefix, scoped_model_id = normalized_model_id.split("/", 1)
        scoped_preset = resolve_model_preset(scoped_model_id)
        if scoped_preset and isinstance(scoped_preset.get("runtime_model_id"), str):
            scoped_runtime_model_id = scoped_preset["runtime_model_id"].strip()
            if scoped_runtime_model_id:
                if scoped_runtime_model_id.startswith(f"{provider_prefix}/"):
                    return scoped_runtime_model_id
                return f"{provider_prefix}/{scoped_runtime_model_id}"

    preset = resolve_model_preset(normalized_model_id)
    if preset and isinstance(preset.get("runtime_model_id"), str):
        runtime_model_id = preset["runtime_model_id"].strip()
        if runtime_model_id:
            return runtime_model_id
    return normalized_model_id


# Local HuggingFace vision models available via LiteLLM
LOCAL_VISION_MODELS: Dict[str, List[str]] = {
    "huggingface-local": [
        "OpenGVLab/InternVL3_5-4B",
        "OpenGVLab/InternVL2_5-8B",
        "OpenGVLab/InternVL2_5-4B",
        "OpenGVLab/InternVL2_5-2B",
        "OpenGVLab/InternVL2_5-1B",
    ]
}
