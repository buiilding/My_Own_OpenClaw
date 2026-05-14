"""Load sidecar extension tools from extensions/*/extension.json."""

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
from types import NoneType, UnionType
from typing import Any, Callable, Union, get_args, get_origin, get_type_hints

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

    model_schema = _read_schema_value(raw_tool.get("schema"), extension_dir)
    if not isinstance(model_schema, dict):
        raise ValueError(f"extension tool {tool_name} is missing schema")

    handler = _load_entrypoint(extension_dir, extension_id, tool_name, entrypoint)
    execution_schema = _infer_execution_schema(handler) or model_schema
    return LoadedExtensionTool(
        name=tool_name,
        extension_id=extension_id,
        handler=_wrap_entrypoint_handler(handler),
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
        raise ValueError(
            f"extension tool arguments do not match entrypoint: {exc}"
        ) from exc
    return dict(bound.arguments)


def _infer_execution_schema(handler: Callable[..., Any]) -> dict[str, Any] | None:
    parameters = list(inspect.signature(handler).parameters.values())
    if _accepts_raw_args(parameters):
        return None

    type_hints = get_type_hints(handler)
    properties: dict[str, Any] = {}
    required: list[str] = []
    for parameter in parameters:
        if parameter.kind in {
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        }:
            annotation = type_hints.get(parameter.name, parameter.annotation)
            properties[parameter.name] = _schema_for_annotation(annotation)
            if parameter.default is inspect.Parameter.empty:
                required.append(parameter.name)
            continue
        raise ValueError(
            "extension tool entrypoint must accept either one args/params/payload "
            "object or keyword-compatible parameters"
        )

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def _schema_for_annotation(annotation: Any) -> dict[str, Any]:
    if annotation is inspect.Parameter.empty or annotation is Any:
        return {}

    origin = get_origin(annotation)
    args = get_args(annotation)
    if origin in {UnionType, Union}:
        non_null_args = [item for item in args if item is not NoneType]
        if len(non_null_args) == 1:
            return _schema_for_annotation(non_null_args[0])
        return {"anyOf": [_schema_for_annotation(item) for item in non_null_args]}

    if annotation is str:
        return {"type": "string"}
    if annotation is bool:
        return {"type": "boolean"}
    if annotation is int:
        return {"type": "integer"}
    if annotation is float:
        return {"type": "number"}
    if annotation is list or origin is list:
        item_annotation = args[0] if args else Any
        return {"type": "array", "items": _schema_for_annotation(item_annotation)}
    if annotation is dict or origin is dict:
        return {"type": "object", "additionalProperties": True}
    return {}


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
