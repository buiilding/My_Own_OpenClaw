"""Deterministic scripted provider for desktop dev-loop validation."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.scripted import SCRIPTED_MODEL_ENTRY
from backend.src.llm.providers.base import LLMProvider

_USER_QUERY_PATTERN = re.compile(
    r"<user_query(?:\s+(?:[^>\"']+|\"[^\"]*\"|'[^']*')*)?>(.*?)</user_query>",
    re.DOTALL,
)


class ScriptedProvider(LLMProvider):
    """Provider that parses @script commands and emits normal model payloads."""

    def _validate_dependencies(self) -> None:
        return None

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        _ = (model, request_kwargs)
        return self._build_response(messages)

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[StreamingEvent, None]:
        _ = (model, request_kwargs)
        response = self._build_response(messages)
        content = response.get("content", "")
        for chunk in _split_stream_chunks(content):
            yield ChunkEvent(content=chunk)
            await asyncio.sleep(0)
        self._set_last_stream_response_payload(response)

    async def list_models(self) -> List[Dict[str, str]]:
        return [dict(SCRIPTED_MODEL_ENTRY)]

    def supports_streaming_tool_turns(self, model: str) -> bool:
        _ = model
        return True

    def _build_response(self, messages: List[LLMMessage]) -> NormalizedLLMResponse:
        prompt_info = _extract_latest_user_prompt_info(messages)
        command = _extract_script_command(prompt_info["text"])
        if command is None:
            return {
                "content": (
                    "Scripted runtime ready. Use @script reply, @script tool, "
                    "@script batch, or @script image?."
                ),
                "finish_reason": "stop",
            }

        action, body = command
        if action == "reply":
            return {"content": body, "finish_reason": "stop"}
        if action == "image?":
            count = prompt_info["image_count"]
            return {
                "content": (
                    f"Scripted runtime received {count} image(s) in the "
                    f"provider prompt. parsed_to_model={str(count > 0).lower()}."
                ),
                "finish_reason": "stop",
            }
        if action == "tool":
            try:
                tool_call = _parse_single_tool_command(body)
            except ValueError as exc:
                return _script_error_response(exc)
            content = _tool_acknowledgement([tool_call])
            return {
                "content": content,
                "tool_calls": [tool_call],
                "finish_reason": "tool_calls",
            }
        if action == "batch":
            try:
                tool_calls = _parse_batch_tool_command(body)
            except ValueError as exc:
                return _script_error_response(exc)
            content = _tool_acknowledgement(tool_calls)
            return {
                "content": content,
                "tool_calls": tool_calls,
                "finish_reason": "tool_calls",
            }
        return {
            "content": (
                f"Unknown scripted command '{action}'. Use reply, tool, batch, or image?."
            ),
            "finish_reason": "stop",
        }

    def _get_full_model_string(self, model_id: str) -> str:
        return model_id

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        _ = (model, runtime_model_id)
        return params


def _split_stream_chunks(content: str) -> List[str]:
    if not content:
        return []
    words = content.split(" ")
    chunks: List[str] = []
    for index, word in enumerate(words):
        suffix = " " if index < len(words) - 1 else ""
        chunks.append(f"{word}{suffix}")
    return chunks


def _extract_latest_user_prompt_info(messages: List[LLMMessage]) -> Dict[str, Any]:
    for message in reversed(messages or []):
        if message.get("role") != "user":
            continue
        return _extract_prompt_info_from_content(message.get("content", ""))
    return {"text": "", "image_count": 0}


def _extract_prompt_info_from_content(content: Any) -> Dict[str, Any]:
    if isinstance(content, str):
        return {"text": content, "image_count": 0}
    if not isinstance(content, list):
        return {"text": str(content or ""), "image_count": 0}

    texts: List[str] = []
    image_count = 0
    for part in content:
        if not isinstance(part, dict):
            continue
        part_type = part.get("type")
        if part_type in {"text", "input_text"} and isinstance(part.get("text"), str):
            texts.append(part["text"])
        elif part_type == "image_url":
            image_url = part.get("image_url")
            if isinstance(image_url, dict) and isinstance(image_url.get("url"), str):
                image_count += 1
    return {"text": "\n".join(texts), "image_count": image_count}


def _extract_script_command(text: str) -> Optional[tuple[str, str]]:
    user_text = _extract_user_query_text(text).strip()
    if not user_text.startswith("@script"):
        return None
    remainder = user_text[len("@script") :].strip()
    if not remainder:
        return ("help", "")
    parts = remainder.split(None, 1)
    action = parts[0].strip().lower()
    body = parts[1] if len(parts) > 1 else ""
    return (action, body.strip())


def _extract_user_query_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    matches = _USER_QUERY_PATTERN.findall(text)
    if matches:
        return matches[-1]
    return text


def _parse_single_tool_command(body: str) -> Dict[str, Any]:
    tool_name, raw_args = _split_tool_body(body)
    args = _parse_json_object(raw_args or "{}")
    return _build_tool_call(tool_name, args, 0)


def _parse_batch_tool_command(body: str) -> List[Dict[str, Any]]:
    parsed = json.loads(body)
    if not isinstance(parsed, list) or not parsed:
        raise ValueError("@script batch expects a non-empty JSON array")
    tool_calls = []
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise ValueError("@script batch entries must be JSON objects")
        tool_name = item.get("tool") or item.get("name")
        if not isinstance(tool_name, str) or not tool_name.strip():
            raise ValueError("@script batch entries require a tool string")
        args = item.get("args", item.get("arguments", {}))
        if not isinstance(args, dict):
            raise ValueError("@script batch entry args must be a JSON object")
        tool_calls.append(_build_tool_call(tool_name, args, index))
    return tool_calls


def _split_tool_body(body: str) -> tuple[str, str]:
    if not isinstance(body, str) or not body.strip():
        raise ValueError("@script tool expects a tool name and JSON object")
    parts = body.strip().split(None, 1)
    if not parts[0].strip():
        raise ValueError("@script tool expects a tool name")
    return parts[0].strip(), parts[1].strip() if len(parts) > 1 else "{}"


def _parse_json_object(raw_json: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON arguments: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("@script tool expects a JSON object for arguments")
    return parsed


def _build_tool_call(
    raw_tool_name: str, raw_args: Dict[str, Any], index: int
) -> Dict[str, Any]:
    tool_name, args = _normalize_scripted_tool(raw_tool_name, raw_args)
    return {
        "id": f"scripted_call_{index + 1}",
        "name": tool_name,
        "arguments": args,
    }


def _normalize_scripted_tool(
    raw_tool_name: str,
    raw_args: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    tool_name = raw_tool_name.strip()
    args = dict(raw_args)
    if tool_name == "filesystem_read":
        tool_name = "read_file"
        if "file_path" not in args and "path" in args:
            args["file_path"] = args.pop("path")
    if tool_name in {"read_file", "screenshot"} and "explanation" not in args:
        args["explanation"] = "Validate the scripted model tool path."
    return tool_name, args


def _tool_acknowledgement(tool_calls: List[Dict[str, Any]]) -> str:
    names = ", ".join(call["name"] for call in tool_calls)
    return f"Scripted runtime queued {len(tool_calls)} tool call(s): {names}."


def _script_error_response(exc: ValueError) -> NormalizedLLMResponse:
    return {
        "content": f"Scripted command error: {exc}",
        "finish_reason": "stop",
    }
