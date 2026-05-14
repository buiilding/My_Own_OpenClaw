"""Load sidecar extension tools from extensions/*/extension.json."""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

TOOL_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,95}$")


@dataclass(slots=True)
class LoadedExtensionTool:
    name: str
    extension_id: str
    handler: Callable[..., Any]
    execution_schema: dict[str, Any]


@dataclass(slots=True)
class LoadedSidecarExtensions:
    tools: dict[str, LoadedExtensionTool] = field(default_factory=dict)
    errors: list[dict[str, str]] = field(default_factory=list)


def resolve_default_extensions_dir() -> Path:
    env_dir = os.getenv("WINDIE_AGENT_EXTENSIONS_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()

    cwd_candidate = Path.cwd() / "extensions"
    if cwd_candidate.exists():
        return cwd_candidate.resolve()

    repo_root_candidate = Path(__file__).resolve().parents[5] / "extensions"
    if repo_root_candidate.exists():
        return repo_root_candidate.resolve()

    return (Path(__file__).resolve().parents[4] / "extensions").resolve()


def load_sidecar_extension_tools(
    extensions_dir: str | os.PathLike[str] | None = None,
) -> LoadedSidecarExtensions:
    root = (
        Path(extensions_dir).expanduser().resolve()
        if extensions_dir
        else resolve_default_extensions_dir()
    )
    result = LoadedSidecarExtensions()
    if not root.exists():
        return result

    for extension_dir in sorted(path for path in root.iterdir() if path.is_dir()):
        manifest_path = extension_dir / "extension.json"
        if not manifest_path.exists():
            continue
        try:
            _load_extension(extension_dir, result)
        except Exception as error:
            result.errors.append(
                {
                    "extension": extension_dir.name,
                    "reason": str(error),
                }
            )
    return result


def _load_extension(extension_dir: Path, result: LoadedSidecarExtensions) -> None:
    manifest = _read_json(extension_dir / "extension.json")
    extension_id = _read_string(manifest.get("id")) or extension_dir.name
    for raw_tool in (
        manifest.get("tools") if isinstance(manifest.get("tools"), list) else []
    ):
        if not isinstance(raw_tool, dict):
            continue
        try:
            loaded_tool = _load_tool(extension_dir, extension_id, raw_tool)
        except Exception as error:
            result.errors.append(
                {
                    "extension": extension_id,
                    "reason": str(error),
                }
            )
            continue
        if loaded_tool.name in result.tools:
            result.errors.append(
                {
                    "extension": extension_id,
                    "reason": f"duplicate extension tool name: {loaded_tool.name}",
                }
            )
            continue
        result.tools[loaded_tool.name] = loaded_tool


def _load_tool(
    extension_dir: Path,
    extension_id: str,
    raw_tool: dict[str, Any],
) -> LoadedExtensionTool:
    tool_name = _read_string(raw_tool.get("name"))
    if not tool_name or not TOOL_NAME_PATTERN.match(tool_name):
        raise ValueError("extension tool name is missing or invalid")

    entrypoint = _read_string(raw_tool.get("entrypoint"))
    if not entrypoint:
        raise ValueError(f"extension tool {tool_name} is missing entrypoint")

    execution_schema = _read_schema_value(
        raw_tool.get("execution_parameters") or raw_tool.get("parameters"),
        extension_dir,
    )
    if not isinstance(execution_schema, dict):
        raise ValueError(f"extension tool {tool_name} is missing parameters")

    handler = _load_entrypoint(extension_dir, extension_id, tool_name, entrypoint)
    return LoadedExtensionTool(
        name=tool_name,
        extension_id=extension_id,
        handler=handler,
        execution_schema=execution_schema,
    )


def _load_entrypoint(
    extension_dir: Path,
    extension_id: str,
    tool_name: str,
    entrypoint: str,
) -> Callable[..., Any]:
    if ":" not in entrypoint:
        raise ValueError(
            f"extension tool {tool_name} entrypoint must be file.py:function"
        )
    raw_file_path, raw_attr_name = entrypoint.split(":", 1)
    attr_name = raw_attr_name.strip()
    if not attr_name:
        raise ValueError(f"extension tool {tool_name} entrypoint function is missing")

    file_path = _resolve_inside_extension(extension_dir, raw_file_path)
    if not file_path.is_file():
        raise ValueError(f"extension tool {tool_name} entrypoint file does not exist")

    module_name = _module_name(extension_id, tool_name)
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ValueError(f"extension tool {tool_name} entrypoint cannot be imported")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    handler = getattr(module, attr_name, None)
    if not callable(handler):
        raise ValueError(f"extension tool {tool_name} entrypoint is not callable")
    return handler


def _read_schema_value(value: Any, extension_dir: Path) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return dict(value)
    schema_path = _read_string(value)
    if not schema_path:
        return None
    loaded = _read_json(_resolve_inside_extension(extension_dir, schema_path))
    return loaded if isinstance(loaded, dict) else None


def _resolve_inside_extension(extension_dir: Path, raw_path: str) -> Path:
    path = (extension_dir / raw_path).resolve()
    try:
        path.relative_to(extension_dir.resolve())
    except ValueError as exc:
        raise ValueError("extension path must stay inside extension directory") from exc
    return path


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _read_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _module_name(extension_id: str, tool_name: str) -> str:
    safe_extension_id = re.sub(r"[^a-zA-Z0-9_]", "_", extension_id)
    safe_tool_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name)
    return f"windie_extension_{safe_extension_id}_{safe_tool_name}"
