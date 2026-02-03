"""
FAISS index helpers for local memory.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def read_index_safe(index_path: Path, faiss_module: Any) -> Optional[Any]:
    if not index_path.exists():
        return None
    try:
        return faiss_module.read_index(str(index_path))
    except Exception as exc:
        logger.warning(
            "Failed to read FAISS index at %s (corrupted?): %s",
            index_path,
            exc,
        )
        try:
            index_path.unlink()
        except Exception as del_err:
            logger.error(
                "Failed to delete corrupted FAISS index %s: %s",
                index_path,
                del_err,
            )
        return None


async def read_index_safe_async(
    index_path: Path, faiss_module: Any
) -> Optional[Any]:
    if not index_path.exists():
        return None

    from core.thread_pool import get_executor

    loop = asyncio.get_running_loop()
    executor = get_executor()

    def load_index() -> Optional[Any]:
        return read_index_safe(index_path, faiss_module)

    return await loop.run_in_executor(executor, load_index)


async def save_indices_async(
    episodic_index: Any,
    semantic_index: Any,
    episodic_path: Path,
    semantic_path: Path,
    faiss_module: Any,
) -> None:
    from core.thread_pool import get_executor

    loop = asyncio.get_running_loop()
    executor = get_executor()

    def save_indices() -> None:
        if episodic_index is not None:
            faiss_module.write_index(episodic_index, str(episodic_path))
        if semantic_index is not None:
            faiss_module.write_index(semantic_index, str(semantic_path))

    try:
        await loop.run_in_executor(executor, save_indices)
    except Exception as exc:
        logger.error("Failed to save FAISS indices: %s", exc)
