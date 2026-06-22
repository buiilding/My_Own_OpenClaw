"""Provider-neutral model-history checkpoint projection."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.src.agent.session.state import ConversationHistory
from backend.src.core.messages.structures import StoredMessage


def _string_list(value: object) -> List[str]:
    if not isinstance(value, list):
        return []
    return [
        entry.strip() for entry in value if isinstance(entry, str) and entry.strip()
    ]


def _row_from_stored_message(
    message: StoredMessage,
    *,
    conversation_ref: str,
    revision_id: str,
    checkpoint_id: str,
    index: int,
) -> Dict[str, Any]:
    return {
        "id": f"{checkpoint_id}:row:{index:04d}",
        "conversation_ref": conversation_ref,
        "revision_id": revision_id,
        "role": message.role.value,
        "message_type": message.message_type.value,
        "content": message.content,
        "tool_call_id": message.tool_call_id,
        "tool_calls": message.tool_calls,
        "tool_name": message.tool_name,
        "image_refs": _string_list(message.image_refs),
        "compaction_facts": message.compaction_facts,
        "source_display_row_ids": [],
    }


def build_model_history_checkpoint(
    history: ConversationHistory,
    *,
    conversation_ref: Optional[str],
    revision_id: Optional[str],
    turn_ref: Optional[str] = None,
    created_at: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Build bounded provider-neutral model-history rows from backend history."""
    if not isinstance(conversation_ref, str) or not conversation_ref.strip():
        return None
    if not isinstance(revision_id, str) or not revision_id.strip():
        return None

    normalized_conversation_ref = conversation_ref.strip()
    normalized_revision_id = revision_id.strip()
    normalized_created_at = created_at or datetime.now(timezone.utc).isoformat()
    checkpoint_suffix = (
        turn_ref.strip() if isinstance(turn_ref, str) and turn_ref.strip() else "latest"
    )
    checkpoint_id = f"mh:{normalized_revision_id}:{checkpoint_suffix}"
    rows = [
        _row_from_stored_message(
            message,
            conversation_ref=normalized_conversation_ref,
            revision_id=normalized_revision_id,
            checkpoint_id=checkpoint_id,
            index=index,
        )
        for index, message in enumerate(history.get_stored_messages(), start=1)
    ]
    return {
        "conversation_ref": normalized_conversation_ref,
        "revision_id": normalized_revision_id,
        "checkpoint_id": checkpoint_id,
        "created_at": normalized_created_at,
        "rows": rows,
    }
