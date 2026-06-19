"""
Model Service.

Responsible for discovering and aggregating available LLM models from:
1. Static configuration (Online models)
2. Dynamic discovery via Providers (Local models)
"""

import asyncio
import copy
import logging
from collections.abc import Iterable
from typing import Any, Awaitable, Dict, List, Optional, Sequence, Tuple

from backend.src.core.config.models import AppConfig
from backend.src.llm.models.models_config import (
    LOCAL_VISION_MODELS,
    ONLINE_MODELS,
    REASONING_MODE_ORDER,
    SCRIPTED_DEV_MODELS,
    THINKING_TEXT_STREAM_UNSUPPORTED_MODELS,
    get_model_card_metadata,
)

# Lazy import to avoid circular dependency
# providers imports models.models_config, so we import providers lazily
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _reasoning_mode_sort_key(mode: str) -> tuple[int, str]:
    try:
        return (REASONING_MODE_ORDER.index(mode), mode)
    except ValueError:
        return (len(REASONING_MODE_ORDER), mode)


def _resolve_entry_reasoning_mode(model: Dict[str, Any]) -> Optional[str]:
    reasoning_mode = _normalize_string(model.get("reasoning_mode")).lower()
    return reasoning_mode or None


def _sanitize_family_label(value: str) -> str:
    import re

    raw_label = _normalize_string(value)
    if not raw_label:
        return raw_label
    cleaned = re.sub(
        r"\b(extra[\s-]*high|xhigh|high|medium|low|minimal|none)\b",
        " ",
        raw_label,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or raw_label


def _select_default_family_model(
    models: Sequence[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not models:
        return None

    non_thinking_model = next(
        (model for model in models if model.get("supports_thinking") is not True),
        None,
    )
    if non_thinking_model is not None:
        return non_thinking_model

    none_reasoning_model = next(
        (model for model in models if _resolve_entry_reasoning_mode(model) == "none"),
        None,
    )
    if none_reasoning_model is not None:
        return none_reasoning_model

    medium_reasoning_model = next(
        (model for model in models if _resolve_entry_reasoning_mode(model) == "medium"),
        None,
    )
    if medium_reasoning_model is not None:
        return medium_reasoning_model

    return models[0]


def _collect_family_reasoning_modes(
    models: Sequence[Dict[str, Any]],
    *,
    default_model: Optional[Dict[str, Any]],
) -> List[str]:
    modes: set[str] = set()
    for model in models:
        if model.get("supports_thinking") is not True:
            continue
        reasoning_mode = _resolve_entry_reasoning_mode(model)
        if not reasoning_mode:
            continue
        modes.add(reasoning_mode)

    if (
        default_model is not None
        and default_model.get("supports_thinking") is not True
        and "none" not in modes
    ):
        default_model_id = _normalize_string(default_model.get("id"))
        if default_model_id:
            modes.add("none")

    return sorted(modes, key=_reasoning_mode_sort_key)


def _derive_family_label(
    models: Sequence[Dict[str, Any]],
    *,
    default_model: Optional[Dict[str, Any]],
) -> str:
    explicit_label = next(
        (
            _normalize_string(model.get("family_label"))
            for model in models
            if _normalize_string(model.get("family_label"))
        ),
        "",
    )
    if explicit_label:
        return explicit_label

    fallback_source = default_model or (models[0] if models else None)
    raw_label = _normalize_string((fallback_source or {}).get("display_name"))
    if raw_label:
        return _sanitize_family_label(raw_label)

    runtime_model_id = _normalize_string(
        (fallback_source or {}).get("runtime_model_id")
    )
    return runtime_model_id


def _enrich_catalog_with_family_metadata(
    models: Sequence[Dict[str, Any]],
) -> Tuple[Dict[str, Any], ...]:
    grouped_models: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for model in models:
        provider = _normalize_string(model.get("provider"))
        runtime_model_id = _normalize_string(
            model.get("runtime_model_id") or model.get("id")
        )
        if not provider or not runtime_model_id:
            continue
        grouped_models.setdefault((provider, runtime_model_id), []).append(model)

    enriched: List[Dict[str, Any]] = []
    for model in models:
        provider = _normalize_string(model.get("provider"))
        runtime_model_id = _normalize_string(
            model.get("runtime_model_id") or model.get("id")
        )
        group = grouped_models.get((provider, runtime_model_id), [model])
        default_model = _select_default_family_model(group)
        family_label = _derive_family_label(group, default_model=default_model)
        reasoning_modes = _collect_family_reasoning_modes(
            group,
            default_model=default_model,
        )
        family_id = f"{provider}::{runtime_model_id}"
        default_model_id = _normalize_string((default_model or {}).get("id"))
        default_reasoning_mode = _resolve_entry_reasoning_mode(default_model or {})
        if (
            default_model is not None
            and default_model.get("supports_thinking") is not True
            and "none" in reasoning_modes
        ):
            default_reasoning_mode = "none"

        entry = dict(model)
        entry["family_id"] = family_id
        if family_label:
            entry["family_label"] = family_label
        entry["reasoning_modes"] = list(reasoning_modes)
        if default_reasoning_mode:
            entry["default_reasoning_mode"] = default_reasoning_mode
        if default_model_id:
            entry["default_model_id"] = default_model_id
        capabilities = entry.get("capabilities")
        if not isinstance(capabilities, dict):
            capabilities = {
                "supports_native_web_search": bool(
                    entry.get("supports_native_web_search")
                ),
            }
        else:
            capabilities = {
                "supports_native_web_search": bool(
                    capabilities.get("supports_native_web_search")
                ),
            }
        entry["capabilities"] = capabilities
        entry["supports_native_web_search"] = bool(
            capabilities["supports_native_web_search"]
        )
        enriched.append(entry)
    return tuple(enriched)


def _build_catalog(
    source: Dict[str, List[Any]],
    supports_thinking: Optional[bool] = None,
) -> Tuple[Dict[str, Any], ...]:
    """Build immutable catalog tuples from static model config."""
    models: List[Dict[str, Any]] = []
    for provider, model_entries in source.items():
        for model_entry in model_entries:
            if isinstance(model_entry, dict):
                model_id = str(model_entry.get("id") or "").strip()
                if not model_id:
                    continue
                runtime_model_id = (
                    str(model_entry.get("runtime_model_id") or model_id).strip()
                    or model_id
                )
                display_name = (
                    str(
                        model_entry.get("display_name") or f"{provider}/{model_id}"
                    ).strip()
                    or f"{provider}/{model_id}"
                )
                entry = {
                    "id": model_id,
                    "runtime_model_id": runtime_model_id,
                    "provider": provider,
                    "display_name": display_name,
                }
                if "supports_thinking" in model_entry:
                    entry["supports_thinking"] = bool(model_entry["supports_thinking"])
                if "supports_thinking_text_stream" in model_entry:
                    entry["supports_thinking_text_stream"] = bool(
                        model_entry["supports_thinking_text_stream"]
                    )
                if "reasoning_mode" in model_entry and isinstance(
                    model_entry["reasoning_mode"], str
                ):
                    normalized_reasoning_mode = model_entry["reasoning_mode"].strip()
                    if normalized_reasoning_mode:
                        entry["reasoning_mode"] = normalized_reasoning_mode
                entry.update(get_model_card_metadata(provider, runtime_model_id))
            else:
                model_id = str(model_entry).strip()
                if not model_id:
                    continue
                entry = {
                    "id": model_id,
                    "runtime_model_id": model_id,
                    "provider": provider,
                    "display_name": f"{provider}/{model_id}",
                }
                entry.update(get_model_card_metadata(provider, model_id))
            if supports_thinking is not None and "supports_thinking" not in entry:
                entry["supports_thinking"] = supports_thinking
            if (
                "supports_thinking" in entry
                and entry["supports_thinking"]
                and "supports_thinking_text_stream" not in entry
            ):
                entry["supports_thinking_text_stream"] = True
            models.append(entry)
    return _enrich_catalog_with_family_metadata(models)


def _copy_catalog(catalog: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a defensive copy so callers cannot mutate cached catalog entries."""
    return [copy.deepcopy(model) for model in catalog]


def _with_thinking_stream_capabilities(
    catalog: Sequence[Dict[str, Any]]
) -> Tuple[Dict[str, Any], ...]:
    """
    Add `supports_thinking_text_stream` to thinking-capable model entries.

    Default is True for thinking models, with explicit per-model overrides for
    providers/models that only return reasoning token counts.
    """
    unsupported_by_provider = {
        provider: set(model_ids)
        for provider, model_ids in THINKING_TEXT_STREAM_UNSUPPORTED_MODELS.items()
    }
    enriched: List[Dict[str, Any]] = []
    for model in catalog:
        entry = dict(model)
        if entry.get("supports_thinking"):
            provider = str(entry.get("provider") or "")
            model_id = str(entry.get("runtime_model_id") or entry.get("id") or "")
            entry["supports_thinking_text_stream"] = (
                model_id not in unsupported_by_provider.get(provider, set())
            )
        enriched.append(entry)
    return tuple(enriched)


def _dedupe_models(models: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate model entries by (provider, id), preserving first-seen order."""
    deduped: List[Dict[str, Any]] = []
    seen: set[tuple[Any, Any]] = set()
    for model in models:
        key = (model.get("provider"), model.get("id"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(model)
    return deduped


_ONLINE_MODELS_CATALOG = _build_catalog(ONLINE_MODELS, supports_thinking=False)
_THINKING_MODELS_CATALOG = _with_thinking_stream_capabilities(
    tuple(
        model
        for model in _ONLINE_MODELS_CATALOG
        if model.get("supports_thinking") is True
    )
)
_VISION_MODELS_CATALOG = _build_catalog(LOCAL_VISION_MODELS)

# Thinking variants win if the same provider/model appears in both catalogs.
_THINKING_IDS = {(m["provider"], m["id"]) for m in _THINKING_MODELS_CATALOG}
_ALL_ONLINE_MODELS_CATALOG = tuple(
    sorted(
        [
            *[
                m
                for m in _ONLINE_MODELS_CATALOG
                if (m["provider"], m["id"]) not in _THINKING_IDS
            ],
            *_THINKING_MODELS_CATALOG,
        ],
        key=lambda m: (m["provider"], m.get("supports_thinking", False)),
    )
)
_SCRIPTED_DEV_MODELS_CATALOG = _build_catalog(
    SCRIPTED_DEV_MODELS, supports_thinking=False
)


class ModelService:
    def __init__(self, config: AppConfig):
        self.config = config

    def get_online_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of popular online models (non-thinking).
        """
        return _copy_catalog(_ONLINE_MODELS_CATALOG)

    def get_thinking_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of models that support thinking tokens.
        """
        return _copy_catalog(_THINKING_MODELS_CATALOG)

    def get_all_online_models(self) -> List[Dict[str, Any]]:
        """
        Return all online models (both thinking and non-thinking).

        Deduplicates models that appear in both lists, preferring the thinking version.
        """
        return _copy_catalog(_ALL_ONLINE_MODELS_CATALOG)

    def get_scripted_dev_models(self) -> List[Dict[str, Any]]:
        """Return deterministic dev-only scripted models."""
        return _copy_catalog(_SCRIPTED_DEV_MODELS_CATALOG)

    def get_vision_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of local vision models.
        """
        return _copy_catalog(_VISION_MODELS_CATALOG)

    @staticmethod
    def _normalize_provider_models(raw_models: Any) -> List[Dict[str, Any]]:
        """Normalize provider model payloads to a clean list of model dicts."""
        if not isinstance(raw_models, Iterable) or isinstance(
            raw_models, (str, bytes, dict)
        ):
            return []

        normalized: List[Dict[str, Any]] = []
        for item in raw_models:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id")
            provider_name = item.get("provider")
            if not isinstance(model_id, str):
                continue
            if not isinstance(provider_name, str):
                continue

            normalized_id = model_id.strip()
            normalized_provider = provider_name.strip()
            if not normalized_id or not normalized_provider:
                continue
            normalized_item = dict(item)
            normalized_item["id"] = normalized_id
            normalized_item["provider"] = normalized_provider
            runtime_model_id = normalized_item.get("runtime_model_id")
            if not isinstance(runtime_model_id, str) or not runtime_model_id.strip():
                normalized_item["runtime_model_id"] = normalized_id
            else:
                normalized_item["runtime_model_id"] = runtime_model_id.strip()
            display_name = normalized_item.get("display_name")
            if not isinstance(display_name, str) or not display_name.strip():
                normalized_item["display_name"] = (
                    f"{normalized_provider}/{normalized_id}"
                )
            else:
                normalized_item["display_name"] = display_name.strip()
            normalized.append(normalized_item)
        return normalized

    async def _list_models_from_provider(
        self,
        label: str,
        provider: "LLMProvider",
    ) -> tuple[str, List[Dict[str, Any]], Optional[str]]:
        """List models from one provider, returning either models or an error string."""
        try:
            raw_models = await provider.list_models()
            models = self._normalize_provider_models(raw_models)
            logger.debug(f"Successfully listed {len(models)} {label} models")
            return label, models, None
        except Exception as e:
            logger.warning(
                f"Failed to list {label} models: {e}",
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            return label, [], str(e)

    async def get_local_models(self) -> List[Dict[str, Any]]:
        """
        Fetch available models from local providers (Ollama, LM Studio).

        Uses the provider factory to ensure consistent provider instantiation
        and benefit from caching. This prevents duplicate provider instances
        and ensures configuration consistency.

        Returns:
            List of available local models. If a provider fails, it logs a warning
            but continues to try other providers. Returns empty list if all providers fail.
        """
        if self.config.model_mode != "local":
            logger.debug(
                "Skipping local model discovery because model_mode=%s",
                self.config.model_mode,
            )
            return []

        # Lazy import to avoid circular dependency
        from backend.src.llm.providers.factory import create_provider_factory

        local_models: List[Dict[str, Any]] = []
        provider_failures: List[tuple[str, str]] = []

        # Get provider factory (cached, uses same instances as rest of system)
        factory = create_provider_factory(self.config)

        jobs: List[Awaitable[tuple[str, List[Dict[str, Any]], Optional[str]]]] = []
        provider_specs = (
            ("ollama", "Ollama"),
            ("lmstudio", "LM Studio"),
        )
        for provider_key, label in provider_specs:
            provider = factory.get(provider_key)
            if provider:
                jobs.append(self._list_models_from_provider(label, provider))
            else:
                logger.debug(f"{label} provider not configured or unavailable")

        if jobs:
            provider_results = await asyncio.gather(*jobs)
            for label, models, error in provider_results:
                if error:
                    provider_failures.append((label, error))
                else:
                    local_models.extend(models)

        # Log summary if all providers failed
        if provider_failures and not local_models:
            logger.warning(
                f"All local providers failed to list models. "
                f"Failures: {', '.join(f'{name}: {error}' for name, error in provider_failures)}"
            )
        elif provider_failures:
            logger.info(
                f"Some local providers failed, but found {len(local_models)} models. "
                f"Failures: {', '.join(f'{name}' for name, _ in provider_failures)}"
            )

        return _dedupe_models(local_models)

    async def get_all_models(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Fetch all available models.
        """
        return {
            "local": await self.get_local_models(),
            "online": self.get_all_online_models(),
            "vision": self.get_vision_models(),
        }
