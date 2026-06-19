"""Scripted runtime model metadata."""

from __future__ import annotations

from typing import Any, Dict

SCRIPTED_PROVIDER_ID = "scripted"
SCRIPTED_MODEL_ID = "scripted-runtime"
SCRIPTED_MODEL_DISPLAY_NAME = "Scripted Runtime"
SCRIPTED_MODEL_ENTRY: Dict[str, Any] = {
    "id": SCRIPTED_MODEL_ID,
    "runtime_model_id": SCRIPTED_MODEL_ID,
    "provider": SCRIPTED_PROVIDER_ID,
    "display_name": SCRIPTED_MODEL_DISPLAY_NAME,
    "supports_thinking": False,
    "description": (
        "Dev-only deterministic model for proving streaming, images, and tool "
        "orchestration without paid inference."
    ),
    "strengths": ["Deterministic", "Tools", "Streaming", "Images"],
    "latency": "instant",
    "context_window": 32768,
    "input_price": "Free",
    "output_price": "Free",
    "family_label": SCRIPTED_MODEL_DISPLAY_NAME,
}
