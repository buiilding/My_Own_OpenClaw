---
summary: "Deep reference for backend logging setup: profile selection, LOG_LEVEL override resolution, noisy logger suppression map, and important-profile per-module level policy."
read_when:
  - When changing `configure_logging` profile defaults, noise-filter logger maps, or level-resolution behavior.
  - When diagnosing missing/extra logs from uvicorn, llm/parser modules, OCR/vision, or third-party libraries.
title: "Log Profile Noise Filter and Env-Level Resolution Contract Reference"
---

# Log Profile Noise Filter and Env-Level Resolution Contract Reference

## Canonical Modules

- `backend/src/core/logging_setup.py`
- `backend/src/core/bootstrap/entrypoint.py`

## Profile Selection Contract

`configure_logging(profile: str | None = None)` resolves profile as:

1. explicit `profile` argument when provided
2. otherwise env `WINDIEOS_LOG_PROFILE`
3. fallback `"important"`

Supported behaviors:

- `verbose` => default base level `DEBUG`
- non-verbose => default base level `INFO`

## `LOG_LEVEL` Override Contract

`_resolve_level(default_level)` applies env `LOG_LEVEL` when present.

- valid Python logging level names override default
- invalid values fall back to provided default

This override applies to both profile branches.

## Base Formatter Contract

`logging.basicConfig` is invoked with:

- `level` resolved as above
- format: `"%(name)s - %(levelname)s - %(message)s"`

## Noise Filter Maps

Always-applied map (`_NOISY_LIB_LOGGERS`):

- lowers common third-party chatter (`litellm`, `httpx/httpcore`, `urllib3`, `transformers`, `sentence_transformers`, OCR/image libraries) to `WARNING`

Important-profile map (`_IMPORTANT_PROFILE_LOGGERS`) additionally:

- suppresses per-request access logs (`uvicorn.access`)
- suppresses configuration/session/parser/internal chatter
- keeps `backend.src.agent.llm.llm_stream_processor` at `INFO` so cache/token diagnostics remain visible without full verbose mode

## Prompt Logging Safety Contract

`backend.src.llm.prompts.prompt_constructor` is explicitly set to `INFO` in all profiles to avoid noisy prompt-content logging behavior.

## Coverage Boundary

No dedicated unit test module currently targets `logging_setup.py` maps/profile resolution directly.

Behavior is validated indirectly through runtime execution and operational logs.

## Drift Hotspots

1. Expanding suppression maps without review can hide critical diagnostics.
2. Removing explicit `llm_stream_processor` INFO override can drop cache/token visibility in important profile.
3. Changing default profile from `important` can dramatically increase startup/runtime log volume for existing deployments.

## Related Pages

- [Backend Core Logging Docs Hub](README.md)
- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](../../bootstrap/entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)
