"""
TTS synthesis worker thread.
"""

from __future__ import annotations

import queue
import threading
from typing import Callable, Optional


class TtsWorker:
    """
    Manages the background synthesis loop and completion signaling.
    """

    def __init__(
        self,
        *,
        input_queue: "queue.Queue[Optional[str]]",
        on_synthesize: Callable[[str], None],
        on_complete: Callable[[], None],
        logger,
    ):
        self.input_queue = input_queue
        self.on_synthesize = on_synthesize
        self.on_complete = on_complete
        self.logger = logger
        self.running = False
        self.worker_thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def stop(self) -> None:
        self.running = False
        self.input_queue.put(None)

    def _worker_loop(self) -> None:
        self.logger.debug("TTS Worker thread started")
        while self.running:
            try:
                text = self.input_queue.get()

                if text is None:
                    self.input_queue.task_done()
                    self.on_complete()
                    continue

                if not text.strip():
                    self.input_queue.task_done()
                    if self.input_queue.empty():
                        self.on_complete()
                    continue

                self.on_synthesize(text)
                self.input_queue.task_done()

                if self.input_queue.empty():
                    self.on_complete()

            except Exception as e:
                self.logger.error(f"TTS Worker Error: {e}", exc_info=True)
                try:
                    self.input_queue.task_done()
                except ValueError:
                    pass

        self.logger.debug("TTS Worker thread stopped")
