"""Prompt and rendering helpers for conversation history compaction."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage

CONTEXT_COMPACTION_PREFIX = "[[CONTEXT COMPACTION SUMMARY]]"
DEFAULT_COMPACTION_SYSTEM_PROMPT = (
    "You summarize long assistant conversations for context-window compaction. "
    "Preserve objectives, constraints, exact identifiers, confirmed results, failed attempts, "
    "and immediate next steps. Distinguish confirmed facts from inferred or preview-only information. "
    "Be concise, factual, and operational. Do not invent details."
)

DEFAULT_COMPACTION_INSTRUCTION = (
    "Summarize the prior conversation so future turns can continue accurately.\n"
    "Return plain text with these exact sections:\n"
    "Objective:\n"
    "Key constraints/preferences:\n"
    "Confirmed state/results:\n"
    "Attempts/errors:\n"
    "Important identifiers:\n"
    "Open tasks / immediate next step:\n"
    "Rules:\n"
    "- Preserve exact refs, ids, URLs, ticket numbers, dates, and message subjects when present.\n"
    "- Explicitly mark preview-only, inferred, blocked, or partial reads.\n"
    "- Prefer short factual bullets or short paragraphs inside each section.\n"
    "- Do not claim a task was completed unless the transcript confirms it."
)

_WHITESPACE_PATTERN = re.compile(r"\s+")


def render_messages_for_compaction_prompt(
    messages: List[StoredMessage],
    *,
    max_chars: int = 24_000,
) -> str:
    """Render stored messages into a compact, structured transcript block."""
    if not messages:
        return "(no prior messages)"

    blocks = [
        _render_message_block(index=index + 1, message=message)
        for index, message in enumerate(messages)
    ]
    blocks = [block for block in blocks if block["text"]]
    if not blocks:
        return "(no prior messages)"

    total_chars = sum(len(block["text"]) for block in blocks)
    if total_chars <= max_chars:
        return "".join(block["text"] for block in blocks)

    return _render_segmented_history(blocks, max_chars=max_chars)


def build_compaction_prompt_messages(
    *,
    rendered_history: str,
    custom_prompt: Optional[str] = None,
) -> List[LLMMessage]:
    """Build model-ready prompt messages used by inline compaction strategy."""
    instruction = (custom_prompt or DEFAULT_COMPACTION_INSTRUCTION).strip()
    user_prompt = (
        f"{instruction}\n\n"
        "Conversation to summarize:\n"
        f"{rendered_history}"
    )
    return [
        {"role": "system", "content": DEFAULT_COMPACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def format_compaction_history_message(summary_text: str) -> str:
    """Wrap summary text in a stable marker for transcript readability."""
    clean = (summary_text or "").strip()
    if not clean:
        clean = "Summary unavailable."
    return f"{CONTEXT_COMPACTION_PREFIX}\n{clean}"


def _render_segmented_history(
    blocks: List[Dict[str, Any]],
    *,
    max_chars: int,
) -> str:
    section_labels = (
        "[Earlier Context]\n",
        "[Sampled Middle Context]\n",
        "[Most Recent Context]\n",
    )
    label_overhead = sum(len(label) for label in section_labels)
    available = max(256, max_chars - label_overhead)
    head_budget = max(256, int(available * 0.28))
    tail_budget = max(256, int(available * 0.47))
    middle_budget = max(0, available - head_budget - tail_budget)

    head = _take_from_start(blocks, budget=head_budget)
    head_end = len(head)

    tail = _take_from_end(blocks[head_end:], budget=tail_budget)
    tail_start = len(blocks) - len(tail)

    middle_source = blocks[head_end:tail_start]
    middle_candidates = [
        block
        for block in middle_source
        if block["signal"] or block["message_type"] in {MessageType.USER_QUERY.value, MessageType.CONTEXT_COMPACTION.value}
    ]
    middle = _take_from_start(
        middle_candidates or middle_source,
        budget=middle_budget,
    )

    parts: List[str] = []
    if head:
        parts.append(section_labels[0])
        parts.extend(block["text"] for block in head)
    if middle:
        parts.append(section_labels[1])
        parts.extend(block["text"] for block in middle)
    if tail:
        parts.append(section_labels[2])
        parts.extend(block["text"] for block in tail)

    rendered = "".join(parts)
    if len(rendered) <= max_chars:
        return rendered
    return rendered[: max(0, max_chars - 4)] + "...\n"


def _take_from_start(blocks: List[Dict[str, Any]], *, budget: int) -> List[Dict[str, Any]]:
    if budget <= 0:
        return []
    selected: List[Dict[str, Any]] = []
    consumed = 0
    for block in blocks:
        block_len = len(block["text"])
        if selected and consumed + block_len > budget:
            break
        if not selected and block_len > budget:
            selected.append(_truncate_block(block, budget))
            break
        selected.append(block)
        consumed += block_len
    return [block for block in selected if block["text"]]


def _take_from_end(blocks: List[Dict[str, Any]], *, budget: int) -> List[Dict[str, Any]]:
    if budget <= 0:
        return []
    reversed_selected: List[Dict[str, Any]] = []
    consumed = 0
    for block in reversed(blocks):
        block_len = len(block["text"])
        if reversed_selected and consumed + block_len > budget:
            break
        if not reversed_selected and block_len > budget:
            reversed_selected.append(_truncate_block(block, budget))
            break
        reversed_selected.append(block)
        consumed += block_len
    return list(reversed([block for block in reversed_selected if block["text"]]))


def _truncate_block(block: Dict[str, Any], budget: int) -> Dict[str, Any]:
    text = block["text"]
    if len(text) <= budget:
        return block
    if budget <= 8:
        return {**block, "text": ""}
    return {**block, "text": text[: budget - 4] + "...\n"}


def _render_message_block(
    *,
    index: int,
    message: StoredMessage,
) -> Dict[str, Any]:
    label = _message_label(message)
    body = _message_body(message)
    if not body:
        return {
            "text": "",
            "signal": False,
            "message_type": message.message_type.value,
        }

    max_body_chars = _per_message_limit(message)
    if len(body) > max_body_chars:
        body = f"{body[: max_body_chars - 3]}..."

    block = f"[{index}] {label}\n{body}\n"
    return {
        "text": block,
        "signal": _is_high_signal_message(message, body),
        "message_type": message.message_type.value,
    }


def _message_label(message: StoredMessage) -> str:
    if message.message_type == MessageType.USER_QUERY:
        return "USER_QUERY"
    if message.message_type == MessageType.CONTEXT_COMPACTION:
        return "PRIOR_COMPACTION"
    if message.role == MessageRole.TOOL:
        tool_name = f" tool={message.tool_name}" if message.tool_name else ""
        return f"TOOL_RESULT{tool_name}"
    if message.message_type == MessageType.TOOL_OUTPUT:
        tool_name = f" tool={message.tool_name}" if message.tool_name else ""
        return f"TOOL_OUTPUT{tool_name}"
    if message.role == MessageRole.ASSISTANT and message.tool_calls:
        return "ASSISTANT_TOOL_CALLS"
    if message.role == MessageRole.ASSISTANT:
        return "ASSISTANT_RESPONSE"
    return _display_role(message.role)


def _message_body(message: StoredMessage) -> str:
    if message.message_type == MessageType.USER_QUERY:
        return _render_user_query(message)
    if message.message_type == MessageType.CONTEXT_COMPACTION:
        summary = _clean_text_for_compaction(message.content).replace(
            CONTEXT_COMPACTION_PREFIX, ""
        ).strip()
        return f"summary: {summary}" if summary else ""
    if message.role == MessageRole.ASSISTANT and message.tool_calls:
        return _render_assistant_tool_calls(message)
    if message.role == MessageRole.TOOL or message.message_type == MessageType.TOOL_OUTPUT:
        return _render_tool_output(message)
    return _render_plain_response(message)


def _render_user_query(message: StoredMessage) -> str:
    query = (
        (message.user_query_raw or "").strip()
        or _extract_xml_tag_content(message.content, "user_query")
        or _clean_text_for_compaction(message.content)
    )
    parts = [f"query: {query}"] if query else []
    active_window = _extract_xml_tag_content(message.content, "active_window")
    if active_window:
        parts.append(f"active_window: {active_window}")
    image_count = _image_count(message)
    if image_count:
        parts.append(f"attachments: {image_count} image(s)")
    return " | ".join(parts)


def _render_assistant_tool_calls(message: StoredMessage) -> str:
    parts: List[str] = []
    content = _clean_text_for_compaction(message.content)
    if content:
        parts.append(f"text: {content}")

    rendered_calls: List[str] = []
    for call in message.tool_calls or []:
        if not isinstance(call, dict):
            continue
        name = str(call.get("name") or "unknown_tool")
        call_id = str(call.get("id") or "").strip()
        arguments = _format_tool_arguments(call.get("arguments"))
        call_text = name
        if arguments:
            call_text = f"{call_text}({arguments})"
        if call_id:
            call_text = f"{call_text} id={call_id}"
        rendered_calls.append(call_text)
        if len(rendered_calls) >= 4:
            break
    if rendered_calls:
        parts.append("tool_calls: " + "; ".join(rendered_calls))
    return " | ".join(parts)


def _render_tool_output(message: StoredMessage) -> str:
    parts: List[str] = []
    if message.tool_name:
        parts.append(f"tool: {message.tool_name}")
    if message.tool_call_id:
        parts.append(f"tool_call_id: {message.tool_call_id}")
    facts = _render_compaction_facts(message.compaction_facts)
    if facts:
        parts.append(f"facts: {facts}")
    content = _clean_text_for_compaction(message.content)
    if content:
        parts.append(f"content: {content}")
    image_count = _image_count(message)
    if image_count:
        parts.append(f"images: {image_count}")
    return " | ".join(parts)


def _render_plain_response(message: StoredMessage) -> str:
    content = _clean_text_for_compaction(message.content)
    return f"text: {content}" if content else ""


def _render_compaction_facts(facts: Optional[Dict[str, Any]]) -> str:
    if not isinstance(facts, dict) or not facts:
        return ""
    pairs: List[str] = []
    for key, value in _flatten_compaction_facts(facts):
        pairs.append(f"{key}={value}")
        if len(pairs) >= 8:
            break
    rendered = "; ".join(pairs)
    if len(rendered) > 320:
        return rendered[:317] + "..."
    return rendered


def _flatten_compaction_facts(
    facts: Dict[str, Any],
    *,
    prefix: str = "",
) -> List[tuple[str, str]]:
    flattened: List[tuple[str, str]] = []
    for key, value in facts.items():
        normalized_key = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            flattened.extend(_flatten_compaction_facts(value, prefix=normalized_key))
            continue
        if isinstance(value, list):
            rendered = ", ".join(_short_value(item) for item in value[:4])
            flattened.append((normalized_key, rendered))
            continue
        flattened.append((normalized_key, _short_value(value)))
        if len(flattened) >= 12:
            break
    return flattened


def _short_value(value: Any) -> str:
    text = str(value).strip()
    text = _WHITESPACE_PATTERN.sub(" ", text)
    if len(text) > 96:
        return text[:93] + "..."
    return text


def _format_tool_arguments(arguments: Any) -> str:
    if not isinstance(arguments, dict):
        return ""
    rendered: List[str] = []
    for key, value in arguments.items():
        rendered.append(f"{key}={_short_value(value)}")
        if len(rendered) >= 4:
            break
    return ", ".join(rendered)


def _clean_text_for_compaction(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    cleaned = cleaned.replace(CONTEXT_COMPACTION_PREFIX, " ")
    cleaned = _WHITESPACE_PATTERN.sub(" ", cleaned).strip()
    if len(cleaned) > 420:
        return cleaned[:417] + "..."
    return cleaned


def _extract_xml_tag_content(content: str, tag_name: str) -> str:
    match = re.search(
        rf"<{tag_name}(?:\s+[^>]*)?>(.*?)</{tag_name}>",
        content or "",
        flags=re.DOTALL,
    )
    if not match:
        return ""
    extracted = _WHITESPACE_PATTERN.sub(" ", match.group(1)).strip()
    if len(extracted) > 160:
        return extracted[:157] + "..."
    return extracted


def _per_message_limit(message: StoredMessage) -> int:
    if message.message_type == MessageType.USER_QUERY:
        return 560
    if message.message_type == MessageType.CONTEXT_COMPACTION:
        return 720
    if message.role == MessageRole.TOOL or message.message_type == MessageType.TOOL_OUTPUT:
        return 680
    if message.role == MessageRole.ASSISTANT and message.tool_calls:
        return 620
    return 520


def _is_high_signal_message(message: StoredMessage, body: str) -> bool:
    if message.message_type in {MessageType.USER_QUERY, MessageType.CONTEXT_COMPACTION}:
        return True
    if message.role == MessageRole.TOOL or message.tool_calls:
        return True
    lowered = body.lower()
    return any(marker in lowered for marker in ("error", "failed", "warning", "blocked", "ticket", "ref="))


def _image_count(message: StoredMessage) -> int:
    if isinstance(message.image_data, str):
        return 1 if message.image_data else 0
    if isinstance(message.image_data, list):
        return len([item for item in message.image_data if isinstance(item, str) and item])
    return 0


def _display_role(role: MessageRole) -> str:
    if role == MessageRole.USER:
        return "User"
    if role == MessageRole.ASSISTANT:
        return "Assistant"
    if role == MessageRole.TOOL:
        return "Tool"
    return "Message"
