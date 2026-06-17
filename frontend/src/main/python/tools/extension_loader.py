"""Load sidecar plugin tools from repo-level plugins/*/plugin.json."""

from __future__ import annotations

import importlib.util
import inspect
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
class LoadedPluginTool:
    name: str
    plugin_id: str
    handler: Callable[..., Any]
    schema: dict[str, Any]
    description: str | None = None


@dataclass(slots=True)
class LoadedSidecarPlugins:
    tools: dict[str, LoadedPluginTool] = field(default_factory=dict)
    errors: list[dict[str, str]] = field(default_factory=list)


def _has_contribution_folders(candidate: Path) -> bool:
    return any((candidate / name).exists() for name in ("plugins", "skills", "mcps"))


def resolve_default_contribution_root() -> Path:
    env_dir = os.getenv("WINDIE_AGENT_CONTRIBUTIONS_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()

    cwd_candidate = Path.cwd()
    if _has_contribution_folders(cwd_candidate):
        return cwd_candidate.resolve()

    repo_root_candidate = Path(__file__).resolve().parents[5]
    if _has_contribution_folders(repo_root_candidate):
        return repo_root_candidate.resolve()

    return repo_root_candidate.resolve()


def load_sidecar_plugin_tools(
    contributions_dir: str | os.PathLike[str] | None = None,
) -> LoadedSidecarPlugins:
    root = (
        Path(contributions_dir).expanduser().resolve()
        if contributions_dir
        else resolve_default_contribution_root()
    )
    result = LoadedSidecarPlugins()
    plugins_root = root / "plugins"
    if not plugins_root.exists():
        return result

    for plugin_dir in sorted(path for path in plugins_root.iterdir() if path.is_dir()):
        manifest_path = plugin_dir / "plugin.json"
        if not manifest_path.exists():
            continue
        try:
            _load_plugin(plugin_dir, result)
        except Exception as error:
            result.errors.append(
                {
                    "plugin": plugin_dir.name,
                    "reason": str(error),
                }
            )
    return result


def load_sidecar_plugin_path(
    plugin_path: str | os.PathLike[str],
) -> LoadedSidecarPlugins:
    """Load tools from one plugin directory, a plugins root, or a contribution root."""
    path = Path(plugin_path).expanduser().resolve()
    result = LoadedSidecarPlugins()
    if not path.exists():
        result.errors.append(
            {
                "plugin": str(path),
                "reason": "plugin path does not exist",
            }
        )
        return result

    try:
        if (path / "plugin.json").is_file():
            _load_plugin(path, result)
        else:
            plugins_root = path / "plugins" if (path / "plugins").is_dir() else path
            for plugin_dir in sorted(child for child in plugins_root.iterdir() if child.is_dir()):
                if (plugin_dir / "plugin.json").is_file():
                    _load_plugin(plugin_dir, result)
    except Exception as error:
        result.errors.append(
            {
                "plugin": path.name,
                "reason": str(error),
            }
        )
    return result


def _load_plugin(plugin_dir: Path, result: LoadedSidecarPlugins) -> None:
    manifest = _read_json(plugin_dir / "plugin.json")
    plugin_id = _read_string(manifest.get("id")) or plugin_dir.name
    for raw_tool in (
        manifest.get("tools") if isinstance(manifest.get("tools"), list) else []
    ):
        if not isinstance(raw_tool, dict):
            continue
        try:
            loaded_tool = _load_tool(plugin_dir, plugin_id, raw_tool)
        except Exception as error:
            result.errors.append(
                {
                    "plugin": plugin_id,
                    "reason": str(error),
                }
            )
            continue
        if loaded_tool.name in result.tools:
            result.errors.append(
                {
                    "plugin": plugin_id,
                    "reason": f"duplicate plugin tool name: {loaded_tool.name}",
                }
            )
            continue
        result.tools[loaded_tool.name] = loaded_tool


def _load_tool(
    plugin_dir: Path,
    plugin_id: str,
    raw_tool: dict[str, Any],
) -> LoadedPluginTool:
    tool_name = _read_string(raw_tool.get("name"))
    if not tool_name or not TOOL_NAME_PATTERN.match(tool_name):
        raise ValueError("plugin tool name is missing or invalid")

    entrypoint = _read_string(raw_tool.get("entrypoint"))
    if not entrypoint:
        raise ValueError(f"plugin tool {tool_name} is missing entrypoint")

    schema = _read_schema_value(raw_tool.get("schema"), plugin_dir)
    if not isinstance(schema, dict):
        raise ValueError(f"plugin tool {tool_name} is missing schema")

    handler = _load_entrypoint(plugin_dir, plugin_id, tool_name, entrypoint)
    return LoadedPluginTool(
        name=tool_name,
        plugin_id=plugin_id,
        handler=_wrap_entrypoint_handler(handler),
        schema=schema,
        description=_read_string(raw_tool.get("description")),
    )


def _load_entrypoint(
    plugin_dir: Path,
    plugin_id: str,
    tool_name: str,
    entrypoint: str,
) -> Callable[..., Any]:
    if ":" not in entrypoint:
        raise ValueError(f"plugin tool {tool_name} entrypoint must be file.py:function")
    raw_file_path, raw_attr_name = entrypoint.split(":", 1)
    attr_name = raw_attr_name.strip()
    if not attr_name:
        raise ValueError(f"plugin tool {tool_name} entrypoint function is missing")

    file_path = _resolve_inside_plugin(plugin_dir, raw_file_path)
    if not file_path.is_file():
        raise ValueError(f"plugin tool {tool_name} entrypoint file does not exist")

    module_name = _module_name(plugin_id, tool_name)
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ValueError(f"plugin tool {tool_name} entrypoint cannot be imported")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    handler = getattr(module, attr_name, None)
    if not callable(handler):
        raise ValueError(f"plugin tool {tool_name} entrypoint is not callable")
    return handler


def _read_schema_value(value: Any, plugin_dir: Path) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return dict(value)
    schema_path = _read_string(value)
    if not schema_path:
        return None
    loaded = _read_json(_resolve_inside_plugin(plugin_dir, schema_path))
    return loaded if isinstance(loaded, dict) else None


def _wrap_entrypoint_handler(
    handler: Callable[..., Any]
) -> Callable[[dict[str, Any]], Any]:
    signature = inspect.signature(handler)
    parameters = list(signature.parameters.values())
    if _accepts_raw_args(parameters):
        return handler

    async def _async_wrapper(args: dict[str, Any]) -> Any:
        result = handler(**_build_handler_kwargs(signature, args))
        if inspect.isawaitable(result):
            return await result
        return result

    return _async_wrapper


def _accepts_raw_args(parameters: list[inspect.Parameter]) -> bool:
    if len(parameters) != 1:
        return False
    parameter = parameters[0]
    return parameter.name in {"args", "params", "payload"} and parameter.kind in {
        inspect.Parameter.POSITIONAL_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
    }


def _build_handler_kwargs(
    signature: inspect.Signature,
    args: dict[str, Any],
) -> dict[str, Any]:
    try:
        bound = signature.bind(**args)
    except TypeError as exc:
        raise ValueError(f"plugin tool arguments do not match entrypoint: {exc}") from exc
    return dict(bound.arguments)


def _resolve_inside_plugin(plugin_dir: Path, raw_path: str) -> Path:
    path = (plugin_dir / raw_path).resolve()
    try:
        path.relative_to(plugin_dir.resolve())
    except ValueError as exc:
        raise ValueError("plugin path must stay inside plugin directory") from exc
    return path


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _read_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _module_name(plugin_id: str, tool_name: str) -> str:
    safe_plugin_id = re.sub(r"[^a-zA-Z0-9_]", "_", plugin_id)
    safe_tool_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name)
    return f"sidecar_plugin_{safe_plugin_id}_{safe_tool_name}"
