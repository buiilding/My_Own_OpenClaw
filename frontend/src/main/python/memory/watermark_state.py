"""
Watermark state storage for local memory semanticization progress.
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class WatermarkStateStore:
    """Read/write watermark state to a JSON file using the shared thread pool."""

    def __init__(self, state_path: Path) -> None:
        self._state_path = state_path

    async def load(self) -> Dict[str, Any]:
        default_state = {
            "last_semanticized_id": None,
            "pending_message_count": 0,
            "last_updated": None,
        }

        if not self._state_path.exists():
            return default_state

        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        def load_state() -> Optional[Dict[str, Any]]:
            try:
                with open(self._state_path, "r") as handle:
                    return json.load(handle)
            except Exception as exc:
                logger.error(
                    "Failed to load watermark state: %s", exc, exc_info=True
                )
                return None

        state = await loop.run_in_executor(executor, load_state)
        if state is None:
            return default_state

        for key, value in default_state.items():
            state.setdefault(key, value)
        return state

    async def save(self, state: Dict[str, Any]) -> None:
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        def save_state() -> None:
            try:
                state["last_updated"] = datetime.now().isoformat()
                with open(self._state_path, "w") as handle:
                    json.dump(state, handle, indent=2)
            except Exception as exc:
                logger.error(
                    "Failed to save watermark state: %s", exc, exc_info=True
                )

        await loop.run_in_executor(executor, save_state)

    async def get(self) -> Dict[str, Any]:
        return await self.load()

    async def update(
        self,
        last_semanticized_id: Optional[str],
        pending_message_count: int = 0,
    ) -> None:
        state = {
            "last_semanticized_id": last_semanticized_id,
            "pending_message_count": pending_message_count,
        }
        await self.save(state)
