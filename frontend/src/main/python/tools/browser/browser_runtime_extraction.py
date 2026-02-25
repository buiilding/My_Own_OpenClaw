"""Shared Browser Use extraction-LLM resolution helpers."""

from __future__ import annotations

import inspect
import os
from typing import Any, Callable

ImportModuleFn = Callable[[str], Any]

OPENAI_COMPAT_EXTRACTION_DEFAULT_BASE_URLS: dict[str, str] = {
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama": "http://localhost:11434/v1",
    "lmstudio": "http://localhost:1234/v1",
    "kimi_coding": "https://api.kimi.com/coding",
}


def normalize_provider_name(provider_name: str | None) -> str | None:
    if not isinstance(provider_name, str):
        return None
    normalized = provider_name.strip().lower().replace("-", "_")
    if not normalized:
        return None
    if normalized == "kimi_code":
        return "kimi_coding"
    if normalized == "gemini":
        return "google"
    return normalized


def resolve_windie_extraction_target(
    import_module_fn: ImportModuleFn,
    *,
    provider_env: str,
    model_id_env: str,
    api_key_env: str,
    base_url_env: str,
) -> tuple[str | None, str | None, str | None, str | None]:
    provider_name = normalize_provider_name(os.getenv(provider_env, ""))
    model_id_raw = os.getenv(model_id_env, "")
    model_id = model_id_raw.strip() or None
    api_key_raw = os.getenv(api_key_env, "")
    api_key = api_key_raw.strip() or None
    base_url_raw = os.getenv(base_url_env, "")
    base_url = base_url_raw.strip() or None

    # Resolve from WindieOS runtime settings when explicit extraction overrides
    # are not supplied.
    try:
        loader_module = import_module_fn("backend.src.core.config.loader")
        load_settings_from_file = getattr(loader_module, "load_settings_from_file", None)
        if not callable(load_settings_from_file):
            return provider_name, model_id, api_key, base_url
        runtime_config = load_settings_from_file()
    except Exception:
        return provider_name, model_id, api_key, base_url

    runtime_provider = normalize_provider_name(getattr(runtime_config, "model_provider", None))
    runtime_model_id_raw = getattr(runtime_config, "selected_model_id", None)
    runtime_model_id = (
        runtime_model_id_raw.strip()
        if isinstance(runtime_model_id_raw, str) and runtime_model_id_raw.strip()
        else None
    )
    if provider_name is None:
        provider_name = runtime_provider
    if model_id is None:
        model_id = runtime_model_id

    if provider_name is None:
        return None, model_id, api_key, base_url

    llm_providers = getattr(runtime_config, "llm_providers", None)
    provider_config = None
    if llm_providers is not None:
        get_provider_config = getattr(llm_providers, "get_provider_config", None)
        if callable(get_provider_config):
            try:
                provider_config = get_provider_config(provider_name)
            except Exception:
                provider_config = None

    if base_url is None and provider_config is not None:
        provider_base_url = getattr(provider_config, "base_url", None)
        if isinstance(provider_base_url, str) and provider_base_url.strip():
            base_url = provider_base_url.strip()

    if api_key is None and runtime_provider == provider_name:
        runtime_api_key = getattr(runtime_config, "api_key", None)
        if isinstance(runtime_api_key, str) and runtime_api_key.strip():
            api_key = runtime_api_key.strip()

    if api_key is None and provider_config is not None:
        api_key_env_name = getattr(provider_config, "api_key_env", None)
        if isinstance(api_key_env_name, str) and api_key_env_name.strip():
            api_key_value = os.getenv(api_key_env_name.strip())
            if isinstance(api_key_value, str) and api_key_value.strip():
                api_key = api_key_value.strip()

    if api_key is None and provider_name == "kimi_coding":
        kimi_legacy_key = os.getenv("KIMICODE_API_KEY")
        if isinstance(kimi_legacy_key, str) and kimi_legacy_key.strip():
            api_key = kimi_legacy_key.strip()

    return provider_name, model_id, api_key, base_url


def _load_chat_model_type(
    import_module_fn: ImportModuleFn,
    module_path: str,
    class_name: str,
) -> type[Any]:
    module = import_module_fn(module_path)
    chat_type = getattr(module, class_name, None)
    if not inspect.isclass(chat_type):
        raise RuntimeError(f"{module_path}.{class_name} is unavailable")
    return chat_type


def _build_openai_compatible_extraction_llm(
    import_module_fn: ImportModuleFn,
    *,
    provider_name: str,
    model_id: str,
    api_key: str | None,
    base_url: str | None,
) -> Any:
    chat_openai_type = _load_chat_model_type(
        import_module_fn,
        "browser_use.llm.openai.chat",
        "ChatOpenAI",
    )
    resolved_base_url = base_url or OPENAI_COMPAT_EXTRACTION_DEFAULT_BASE_URLS.get(provider_name)
    kwargs: dict[str, Any] = {"model": model_id}
    if api_key:
        kwargs["api_key"] = api_key
    if resolved_base_url:
        kwargs["base_url"] = resolved_base_url
    return chat_openai_type(**kwargs)


def _build_google_extraction_llm(
    import_module_fn: ImportModuleFn,
    *,
    model_id: str,
    api_key: str | None,
) -> Any:
    chat_google_type = _load_chat_model_type(
        import_module_fn,
        "browser_use.llm.google.chat",
        "ChatGoogle",
    )
    kwargs: dict[str, Any] = {"model": model_id}
    if api_key:
        kwargs["api_key"] = api_key
    return chat_google_type(**kwargs)


def _build_mistral_extraction_llm(
    import_module_fn: ImportModuleFn,
    *,
    model_id: str,
    api_key: str | None,
    base_url: str | None,
) -> Any:
    chat_mistral_type = _load_chat_model_type(
        import_module_fn,
        "browser_use.llm.mistral.chat",
        "ChatMistral",
    )
    kwargs: dict[str, Any] = {"model": model_id}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    return chat_mistral_type(**kwargs)


def build_windie_extraction_llm(
    import_module_fn: ImportModuleFn,
    *,
    provider_name: str | None,
    model_id: str | None,
    api_key: str | None,
    base_url: str | None,
) -> tuple[Any | None, str | None]:
    if not provider_name or not model_id:
        return None, None

    if provider_name in {"openai", "openrouter", "ollama", "lmstudio", "kimi_coding"}:
        llm = _build_openai_compatible_extraction_llm(
            import_module_fn,
            provider_name=provider_name,
            model_id=model_id,
            api_key=api_key,
            base_url=base_url,
        )
        return llm, None

    if provider_name == "google":
        llm = _build_google_extraction_llm(
            import_module_fn,
            model_id=model_id,
            api_key=api_key,
        )
        return llm, None

    if provider_name == "mistral":
        llm = _build_mistral_extraction_llm(
            import_module_fn,
            model_id=model_id,
            api_key=api_key,
            base_url=base_url,
        )
        return llm, None

    return (
        None,
        (
            "WindieOS extraction provider "
            f"'{provider_name}' is not mapped to a Browser Use LLM adapter."
        ),
    )
