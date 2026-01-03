"""
Global Thread Pool for the Frontend Python Sidecar.

This module provides a shared ThreadPoolExecutor that stays alive as long as 
the sidecar process is running, avoiding the overhead of creating and 
destroying threads for every operation.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

logger = logging.getLogger(__name__)

# Global executor instance
_executor: Optional[ThreadPoolExecutor] = None

def get_executor(max_workers: int = 10) -> ThreadPoolExecutor:
    """
    Get the global ThreadPoolExecutor instance.
    Initializes it if it doesn't exist.
    """
    global _executor
    if _executor is None:
        logger.info(f"Initializing global thread pool with {max_workers} workers")
        _executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="GlobalWorker")
    return _executor

def shutdown_executor(wait: bool = True) -> None:
    """
    Shutdown the global ThreadPoolExecutor.
    """
    global _executor
    if _executor is not None:
        logger.info("Shutting down global thread pool")
        _executor.shutdown(wait=wait)
        _executor = None
