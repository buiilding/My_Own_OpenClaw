"""Static online/local model catalogs and variant helpers."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from backend.src.llm.models.scripted import (
    SCRIPTED_MODEL_ENTRY,
    SCRIPTED_PROVIDER_ID,
)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _normalize_provider_name(provider_name: str | None) -> str:
    if not isinstance(provider_name, str):
        return ""
    normalized = provider_name.strip().lower().replace("_", "-")
    if normalized == "google":
        return "gemini"
    return normalized


def _variant(
    *,
    runtime_model_id: str,
    display_name: str,
    supports_thinking: bool,
    supports_thinking_text_stream: Optional[bool] = None,
    reasoning_mode: Optional[str] = None,
    thinking_budget_tokens: Optional[int] = None,
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
    if supports_thinking and isinstance(reasoning_mode, str) and reasoning_mode.strip():
        entry["reasoning_mode"] = reasoning_mode.strip()
    if (
        supports_thinking
        and isinstance(thinking_budget_tokens, int)
        and thinking_budget_tokens > 0
    ):
        entry["thinking_budget_tokens"] = thinking_budget_tokens
    return entry


LOW_THINKING_BUDGET_TOKENS = 4096
DEFAULT_THINKING_BUDGET_TOKENS = 16384
HIGH_THINKING_BUDGET_TOKENS = 32768
REASONING_MODE_ORDER: Tuple[str, ...] = ("none", "low", "medium", "high", "xhigh")


def _openai_reasoning_presets(
    *,
    runtime_model_id: str,
    family_label: str,
) -> List[Dict[str, Any]]:
    return [
        _variant(
            runtime_model_id=runtime_model_id,
            display_name=f"{family_label} None",
            supports_thinking=True,
            supports_thinking_text_stream=True,
            reasoning_mode="none",
        ),
        _variant(
            runtime_model_id=runtime_model_id,
            display_name=f"{family_label} Low",
            supports_thinking=True,
            supports_thinking_text_stream=True,
            reasoning_mode="low",
        ),
        _variant(
            runtime_model_id=runtime_model_id,
            display_name=f"{family_label} Medium",
            supports_thinking=True,
            supports_thinking_text_stream=True,
            reasoning_mode="medium",
        ),
        _variant(
            runtime_model_id=runtime_model_id,
            display_name=f"{family_label} High",
            supports_thinking=True,
            supports_thinking_text_stream=True,
            reasoning_mode="high",
        ),
        _variant(
            runtime_model_id=runtime_model_id,
            display_name=f"{family_label} Extra High",
            supports_thinking=True,
            supports_thinking_text_stream=True,
            reasoning_mode="xhigh",
        ),
    ]


def _card_metadata(
    *,
    context_window: int,
    description: str,
    strengths: List[str],
    latency: str,
    family_label: Optional[str] = None,
    input_price: str = "Free",
    output_price: str = "Free",
) -> Dict[str, Any]:
    metadata = {
        "context_window": context_window,
        "description": description,
        "strengths": list(strengths),
        "latency": latency,
        "input_price": input_price,
        "output_price": output_price,
    }
    if isinstance(family_label, str) and family_label.strip():
        metadata["family_label"] = family_label.strip()
    return metadata


MODEL_CARD_METADATA_BY_RUNTIME_ID: Dict[str, Dict[str, Any]] = {
    "gpt-5.4": _card_metadata(
        context_window=400000,
        description="OpenAI's GPT-5.4 reasoning model with configurable effort from none through xhigh.",
        strengths=["Reasoning", "Code", "Agents", "Tools"],
        latency="~1.4s",
        family_label="GPT-5.4",
    ),
    "gpt-5.5": _card_metadata(
        context_window=400000,
        description="OpenAI's GPT-5.5 reasoning model with configurable effort from none through xhigh.",
        strengths=["Reasoning", "Code", "Agents", "Tools"],
        latency="~1.4s",
        family_label="GPT-5.5",
    ),
    "claude-sonnet-4-5-20250929": _card_metadata(
        context_window=200000,
        description="Anthropic's Claude Sonnet 4.5 balances strong coding, reasoning, and agent reliability.",
        strengths=["Agents", "Coding", "Writing", "Reliable"],
        latency="~1.3s",
    ),
    "claude-opus-4-6": _card_metadata(
        context_window=1000000,
        description="Anthropic's most capable Claude 4.6 model for difficult coding, analysis, and long-context work.",
        strengths=["Deep Reasoning", "Coding", "Long Context", "Agents"],
        latency="~2.2s",
    ),
    "claude-haiku-4-5-20251001": _card_metadata(
        context_window=200000,
        description="Anthropic's fastest Claude 4.5 family model for responsive assistants and lightweight agent tasks.",
        strengths=["Fast", "Efficiency", "Agents", "Writing"],
        latency="~0.9s",
    ),
    "claude-sonnet-4-6": _card_metadata(
        context_window=1000000,
        description="Claude Sonnet 4.6 pairs frontier reasoning with 1M-token context for serious agent workflows.",
        strengths=["Long Context", "Agents", "Coding", "Balanced"],
        latency="~1.4s",
    ),
    "claude-opus-4-5": _card_metadata(
        context_window=200000,
        description="Claude Opus 4.5 prioritizes maximum capability for demanding coding and reasoning tasks.",
        strengths=["Deep Reasoning", "Coding", "Analysis", "Vision"],
        latency="~2.1s",
    ),
    "claude-haiku-4-5": _card_metadata(
        context_window=200000,
        description="Claude Haiku 4.5 emphasizes speed and efficiency while keeping the Claude 4.5 tool-use stack.",
        strengths=["Fast", "Efficiency", "Agents", "Vision"],
        latency="~0.9s",
    ),
    "claude-sonnet-4-5": _card_metadata(
        context_window=200000,
        description="Claude Sonnet 4.5 is Anthropic's balanced model for coding, reasoning, and agent execution.",
        strengths=["Coding", "Reasoning", "Agents", "Writing"],
        latency="~1.3s",
    ),
    "claude-sonnet-4-20250514": _card_metadata(
        context_window=200000,
        description="Claude Sonnet 4 offers strong everyday coding and analysis with dependable tool use.",
        strengths=["Coding", "Reasoning", "Agents", "Balanced"],
        latency="~1.3s",
    ),
    "gemini-2.5-flash": _card_metadata(
        context_window=1048576,
        description="Faster than Gemini 2.5 Pro and cheaper to run, while keeping 1M-token context for everyday multimodal chat and coding.",
        strengths=["Fast", "Multimodal", "Search", "1M Context"],
        latency="~1.0s",
    ),
    "gemini-2.5-pro": _card_metadata(
        context_window=1048576,
        description="More capable than Gemini 2.5 Flash for harder reasoning, code, and STEM work, with the same 1M-token context.",
        strengths=["Reasoning", "Code", "Multimodal", "1M Context"],
        latency="~1.8s",
    ),
    "gemini-3-pro-preview": _card_metadata(
        context_window=1048576,
        description="More capable than Gemini 3 Flash for deeper reasoning, planning, and agent workflows, with 1M-token context.",
        strengths=["Reasoning", "Multimodal", "Agents", "1M Context"],
        latency="~1.8s",
    ),
    "gemini-3-flash-preview": _card_metadata(
        context_window=1048576,
        description="Faster than Gemini 3 Pro for responsive multimodal tasks and coding, while keeping 1M-token context.",
        strengths=["Fast", "Multimodal", "Code", "1M Context"],
        latency="~1.0s",
    ),
    "gemini-3.1-pro-preview": _card_metadata(
        context_window=1048576,
        description="A stronger Gemini 3.1 Pro preview for advanced coding, long-context reasoning, and multimodal agent work.",
        strengths=["Reasoning", "Code", "Multimodal", "1M Context"],
        latency="~1.7s",
    ),
    "openrouter/auto": _card_metadata(
        context_window=2000000,
        description="OpenRouter's auto router picks a suitable upstream model automatically for each request.",
        strengths=["Auto Routing", "2M Context", "Flexible", "Breadth"],
        latency="~1.4s",
    ),
    "qwen/qwen3-vl-235b-a22b-thinking": _card_metadata(
        context_window=131072,
        description="Qwen3 VL 235B A22B Thinking is a multimodal reasoning model exposed through OpenRouter.",
        strengths=["Multimodal", "Vision", "Reasoning", "UI Tasks"],
        latency="~2.0s",
    ),
    "mistral-large-latest": _card_metadata(
        context_window=256000,
        description="Mistral's flagship large model for coding, reasoning, and multimodal assistance.",
        strengths=["Coding", "Reasoning", "Multimodal", "256k Context"],
        latency="~1.6s",
    ),
    "mistral-small-latest": _card_metadata(
        context_window=128000,
        description="Mistral's smaller general-purpose model for fast chat, instruction following, and coding support.",
        strengths=["Fast", "Coding", "Efficient", "128k Context"],
        latency="~1.0s",
    ),
    "k2p5": _card_metadata(
        context_window=256000,
        description="Moonshot's Kimi K2.5 model is built for agentic coding, multimodal reasoning, and long-context work.",
        strengths=["Agentic", "Coding", "Multimodal", "256k Context"],
        latency="~1.4s",
    ),
}

MODEL_CAPABILITIES_BY_PROVIDER_RUNTIME_ID: Dict[Tuple[str, str], Dict[str, bool]] = {
    ("openai", "gpt-5.4"): {
        "supports_native_web_search": True,
    },
    ("openai", "gpt-5.5"): {
        "supports_native_web_search": True,
    },
    ("gemini", "gemini-2.5-flash"): {
        "supports_native_web_search": True,
    },
    ("gemini", "gemini-2.5-pro"): {
        "supports_native_web_search": True,
    },
    ("gemini", "gemini-3-pro-preview"): {
        "supports_native_web_search": True,
    },
    ("gemini", "gemini-3-flash-preview"): {
        "supports_native_web_search": True,
    },
    ("gemini", "gemini-3.1-pro-preview"): {
        "supports_native_web_search": True,
    },
}


def _candidate_runtime_metadata_ids(
    provider_name: str,
    runtime_model_id: str,
) -> List[str]:
    normalized_provider = _normalize_provider_name(provider_name)
    normalized_runtime_model_id = str(runtime_model_id or "").strip()
    candidates: List[str] = []
    if normalized_runtime_model_id:
        candidates.append(normalized_runtime_model_id)
    if (
        normalized_provider
        and normalized_runtime_model_id
        and not normalized_runtime_model_id.startswith(f"{normalized_provider}/")
    ):
        candidates.append(f"{normalized_provider}/{normalized_runtime_model_id}")
    if "/" in normalized_runtime_model_id:
        _, stripped_runtime_model_id = normalized_runtime_model_id.split("/", 1)
        if stripped_runtime_model_id:
            candidates.append(stripped_runtime_model_id)
    deduped: List[str] = []
    for candidate in candidates:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped


def get_model_catalog_metadata(
    provider_name: str,
    runtime_model_id: str,
) -> Dict[str, Any]:
    normalized_provider = _normalize_provider_name(provider_name)
    candidates = _candidate_runtime_metadata_ids(provider_name, runtime_model_id)

    metadata: Dict[str, Any] = {}
    for candidate in candidates:
        if candidate in MODEL_CARD_METADATA_BY_RUNTIME_ID:
            metadata.update(dict(MODEL_CARD_METADATA_BY_RUNTIME_ID[candidate]))
            break

    capability_defaults = {
        "supports_native_web_search": False,
    }
    for candidate in candidates:
        capabilities = MODEL_CAPABILITIES_BY_PROVIDER_RUNTIME_ID.get(
            (normalized_provider, candidate)
        )
        if capabilities:
            capability_defaults.update(dict(capabilities))
            break

    metadata.setdefault("input_price", "Free")
    metadata.setdefault("output_price", "Free")
    metadata.setdefault("capabilities", dict(capability_defaults))
    metadata.setdefault(
        "supports_native_web_search",
        bool(capability_defaults["supports_native_web_search"]),
    )
    return metadata


def get_model_card_metadata(
    provider_name: str, runtime_model_id: str
) -> Dict[str, Any]:
    return get_model_catalog_metadata(provider_name, runtime_model_id)


OPENAI_PRESETS: List[Dict[str, Any]] = [
    *_openai_reasoning_presets(
        runtime_model_id="gpt-5.4",
        family_label="GPT-5.4",
    ),
    *_openai_reasoning_presets(
        runtime_model_id="gpt-5.5",
        family_label="GPT-5.5",
    ),
]


ANTHROPIC_PRESETS: List[Dict[str, Any]] = [
    _variant(
        runtime_model_id="claude-sonnet-4-5-20250929",
        display_name="Claude Sonnet 4.5",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5-20250929",
        display_name="Claude Sonnet 4.5",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5-20250929",
        display_name="Claude Sonnet 4.5 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5-20250929",
        display_name="Claude Sonnet 4.5 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Claude Opus 4.6",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Claude Opus 4.6",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Claude Opus 4.6 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Claude Opus 4.6 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-haiku-4-5-20251001",
        display_name="Claude Haiku 4.5",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-6",
        display_name="Sonnet 4.6",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-6",
        display_name="Sonnet 4.6",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-6",
        display_name="Sonnet 4.6 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-6",
        display_name="Sonnet 4.6 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6 Max",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6 Max",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6 Fast Max Only",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-6",
        display_name="Opus 4.6 Max Fast Max Only",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-5",
        display_name="Opus 4.5",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-opus-4-5",
        display_name="Opus 4.5",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-opus-4-5",
        display_name="Opus 4.5 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-opus-4-5",
        display_name="Opus 4.5 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-haiku-4-5",
        display_name="Haiku 4.5",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-haiku-4-5",
        display_name="Haiku 4.5",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-haiku-4-5",
        display_name="Haiku 4.5 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-haiku-4-5",
        display_name="Haiku 4.5 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5",
        display_name="Sonnet 4.5",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5",
        display_name="Sonnet 4.5",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5",
        display_name="Sonnet 4.5 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-5",
        display_name="Sonnet 4.5 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4 Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4 High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4 1M Max Only",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="claude-sonnet-4-20250514",
        display_name="Sonnet 4 1M Max Only",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
]


GEMINI_PRESETS: List[Dict[str, Any]] = [
    _variant(
        runtime_model_id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3-pro-preview",
        display_name="Gemini 3 Pro",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="gemini-3-pro-preview",
        display_name="Gemini 3 Pro Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3-pro-preview",
        display_name="Gemini 3 Pro High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3-flash-preview",
        display_name="Gemini 3 Flash",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="gemini-3-flash-preview",
        display_name="Gemini 3 Flash Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3-flash-preview",
        display_name="Gemini 3 Flash High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro",
        supports_thinking=False,
    ),
    _variant(
        runtime_model_id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        supports_thinking=True,
        supports_thinking_text_stream=True,
    ),
    _variant(
        runtime_model_id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash Low",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="low",
        thinking_budget_tokens=LOW_THINKING_BUDGET_TOKENS,
    ),
    _variant(
        runtime_model_id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash High",
        supports_thinking=True,
        supports_thinking_text_stream=True,
        reasoning_mode="high",
        thinking_budget_tokens=HIGH_THINKING_BUDGET_TOKENS,
    ),
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

SCRIPTED_DEV_MODELS: Dict[str, List[Dict[str, Any]]] = {
    SCRIPTED_PROVIDER_ID: [SCRIPTED_MODEL_ENTRY],
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
THINKING_TEXT_STREAM_UNSUPPORTED_MODELS: Dict[str, List[str]] = {}


_MODEL_PRESET_BY_ID: Dict[str, Dict[str, Any]] = {
    str(model.get("id")): dict(model)
    for models in [*ONLINE_MODELS.values(), *SCRIPTED_DEV_MODELS.values()]
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
    supports_thinking = (
        preset.get("supports_thinking") if isinstance(preset, dict) else None
    )
    if isinstance(supports_thinking, bool):
        return supports_thinking

    thinking_models = ONLINE_THINKING_MODELS.get(normalized_provider, [])
    if normalized_model_id in thinking_models:
        return True
    return None


def resolve_provider_thinking_budget_tokens(
    *,
    model_id: str,
    provider_name: str,
) -> Optional[int]:
    """Resolve model-scoped thinking token budget override for provider-native reasoning."""
    if not isinstance(model_id, str) or not isinstance(provider_name, str):
        return None
    normalized_model_id = model_id.strip()
    normalized_provider = provider_name.strip().lower()
    if not normalized_model_id or not normalized_provider:
        return None

    preset = resolve_model_preset(normalized_model_id)
    if isinstance(preset, dict):
        value = preset.get("thinking_budget_tokens")
        if isinstance(value, int) and value > 0:
            return value
    return None


def resolve_model_capabilities(
    *,
    model_id: str,
    provider_name: str,
) -> Dict[str, bool]:
    if not isinstance(model_id, str) or not isinstance(provider_name, str):
        return {
            "supports_native_web_search": False,
        }

    normalized_model_id = model_id.strip()
    candidate_model_ids = [normalized_model_id]
    if "@@" in normalized_model_id:
        selected_model_id, _ = normalized_model_id.split("@@", 1)
        if selected_model_id:
            candidate_model_ids.insert(0, selected_model_id)

    resolved = {
        "supports_native_web_search": False,
    }
    for candidate_model_id in candidate_model_ids:
        runtime_model_id = resolve_runtime_model_id(candidate_model_id)
        metadata = get_model_catalog_metadata(provider_name, runtime_model_id)
        capabilities = metadata.get("capabilities")
        if isinstance(capabilities, dict):
            candidate_capabilities = {
                "supports_native_web_search": bool(
                    capabilities.get("supports_native_web_search")
                ),
            }
        else:
            candidate_capabilities = {
                "supports_native_web_search": bool(
                    metadata.get("supports_native_web_search")
                ),
            }
        resolved["supports_native_web_search"] = (
            resolved["supports_native_web_search"]
            or candidate_capabilities["supports_native_web_search"]
        )
    return resolved


def supports_model_capability(
    *,
    model_id: str,
    provider_name: str,
    capability_name: str,
) -> bool:
    capabilities = resolve_model_capabilities(
        model_id=model_id,
        provider_name=provider_name,
    )
    return bool(capabilities.get(str(capability_name or "").strip(), False))


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
